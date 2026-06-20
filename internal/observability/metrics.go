package observability

import (
	"fmt"
	"maps"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var defaultDurationBuckets = []float64{
	0.005,
	0.01,
	0.025,
	0.05,
	0.1,
	0.25,
	0.5,
	1,
	2.5,
	5,
	10,
}

type counterSample struct {
	labels map[string]string
	value  uint64
}

type histogramSample struct {
	labels  map[string]string
	buckets []uint64
	count   uint64
	sum     float64
}

type counterVec struct {
	mu         sync.Mutex
	labelNames []string
	samples    map[string]*counterSample
}

type histogramVec struct {
	mu         sync.Mutex
	labelNames []string
	bounds     []float64
	samples    map[string]*histogramSample
}

type Metrics struct {
	httpRequests       *counterVec
	httpRequestLatency *histogramVec
	jikanRequests      *counterVec
	jikanRequestErrors *counterVec
	jikanLatency       *histogramVec
	dbQueryLatency     *histogramVec
	workerTicks        *counterVec
	cacheOperations    *counterVec
}

func NewMetrics() *Metrics {
	return &Metrics{
		httpRequests:       newCounterVec("method", "route", "status"),
		httpRequestLatency: newHistogramVec(defaultDurationBuckets, "method", "route", "status"),
		jikanRequests:      newCounterVec("endpoint", "status"),
		jikanRequestErrors: newCounterVec("endpoint", "status"),
		jikanLatency:       newHistogramVec(defaultDurationBuckets, "endpoint", "status"),
		dbQueryLatency:     newHistogramVec(defaultDurationBuckets, "operation", "result"),
		workerTicks:        newCounterVec("worker", "result"),
		cacheOperations:    newCounterVec("cache", "result"),
	}
}

func (m *Metrics) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		if err := m.writePrometheus(w); err != nil {
			WarnContext(r.Context(), "metrics_write_failed", "observability", "", nil, err)
		}
	})
}

func (m *Metrics) ObserveHTTPRequest(method string, route string, status int, duration time.Duration) {
	statusLabel := strconv.Itoa(status)
	m.httpRequests.Inc(method, route, statusLabel)
	m.httpRequestLatency.Observe(duration.Seconds(), method, route, statusLabel)
}

func (m *Metrics) ObserveJikanRequest(endpoint string, status int, duration time.Duration, err error) {
	statusLabel := strconv.Itoa(status)
	m.jikanRequests.Inc(endpoint, statusLabel)
	m.jikanLatency.Observe(duration.Seconds(), endpoint, statusLabel)
	if err != nil || status >= http.StatusBadRequest {
		m.jikanRequestErrors.Inc(endpoint, statusLabel)
	}
}

func (m *Metrics) ObserveDBQuery(operation string, duration time.Duration, err error) {
	result := "success"
	if err != nil {
		result = "error"
	}
	m.dbQueryLatency.Observe(duration.Seconds(), operation, result)
}

func (m *Metrics) ObserveWorkerTick(worker string, err error) {
	if err != nil {
		m.workerTicks.Inc(worker, "failure")
		return
	}
	m.workerTicks.Inc(worker, "success")
}

func (m *Metrics) ObserveCache(cache string, result string) {
	m.cacheOperations.Inc(cache, result)
}

func (m *Metrics) writePrometheus(w http.ResponseWriter) error {
	if err := writeCounterMetric(w, "mal_http_requests_total", "Total HTTP requests by method, route, and status.", m.httpRequests.snapshot()); err != nil {
		return err
	}
	if err := writeHistogramMetric(w, "mal_http_request_duration_seconds", "HTTP request latency in seconds.", m.httpRequestLatency.snapshot(), m.httpRequestLatency.bounds); err != nil {
		return err
	}
	if err := writeCounterMetric(w, "mal_jikan_upstream_requests_total", "Total upstream Jikan requests by endpoint and status.", m.jikanRequests.snapshot()); err != nil {
		return err
	}
	if err := writeCounterMetric(w, "mal_jikan_upstream_errors_total", "Total upstream Jikan errors by endpoint and status.", m.jikanRequestErrors.snapshot()); err != nil {
		return err
	}
	if err := writeHistogramMetric(w, "mal_jikan_upstream_request_duration_seconds", "Upstream Jikan request latency in seconds.", m.jikanLatency.snapshot(), m.jikanLatency.bounds); err != nil {
		return err
	}
	if err := writeHistogramMetric(w, "mal_db_query_duration_seconds", "Database query latency in seconds.", m.dbQueryLatency.snapshot(), m.dbQueryLatency.bounds); err != nil {
		return err
	}
	if err := writeCounterMetric(w, "mal_worker_ticks_total", "Total background worker ticks by worker and result.", m.workerTicks.snapshot()); err != nil {
		return err
	}
	return writeCounterMetric(w, "mal_cache_operations_total", "Total cache hits and misses by cache name.", m.cacheOperations.snapshot())
}

func newCounterVec(labelNames ...string) *counterVec {
	return &counterVec{
		labelNames: append([]string(nil), labelNames...),
		samples:    make(map[string]*counterSample),
	}
}

func (c *counterVec) Inc(labelValues ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	key, labels := buildLabelKey(c.labelNames, labelValues)
	if labels == nil {
		return
	}
	sample, ok := c.samples[key]
	if !ok {
		sample = &counterSample{labels: labels}
		c.samples[key] = sample
	}
	sample.value++
}

func (c *counterVec) snapshot() []counterSample {
	c.mu.Lock()
	defer c.mu.Unlock()

	keys := sortedCounterSampleKeys(c.samples)
	out := make([]counterSample, 0, len(keys))
	for _, key := range keys {
		sample := c.samples[key]
		out = append(out, counterSample{
			labels: copyLabels(sample.labels),
			value:  sample.value,
		})
	}
	return out
}

func newHistogramVec(bounds []float64, labelNames ...string) *histogramVec {
	return &histogramVec{
		labelNames: append([]string(nil), labelNames...),
		bounds:     append([]float64(nil), bounds...),
		samples:    make(map[string]*histogramSample),
	}
}

func (h *histogramVec) Observe(value float64, labelValues ...string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	key, labels := buildLabelKey(h.labelNames, labelValues)
	if labels == nil {
		return
	}
	sample, ok := h.samples[key]
	if !ok {
		sample = &histogramSample{
			labels:  labels,
			buckets: make([]uint64, len(h.bounds)),
		}
		h.samples[key] = sample
	}

	sample.count++
	sample.sum += value
	for idx, bound := range h.bounds {
		if value <= bound {
			sample.buckets[idx]++
		}
	}
}

func (h *histogramVec) snapshot() []histogramSample {
	h.mu.Lock()
	defer h.mu.Unlock()

	keys := sortedHistogramSampleKeys(h.samples)
	out := make([]histogramSample, 0, len(keys))
	for _, key := range keys {
		sample := h.samples[key]
		buckets := make([]uint64, len(sample.buckets))
		copy(buckets, sample.buckets)
		out = append(out, histogramSample{
			labels:  copyLabels(sample.labels),
			buckets: buckets,
			count:   sample.count,
			sum:     sample.sum,
		})
	}
	return out
}

func buildLabelKey(labelNames []string, labelValues []string) (string, map[string]string) {
	if len(labelNames) != len(labelValues) {
		return "", nil
	}

	labels := make(map[string]string, len(labelNames))
	parts := make([]string, 0, len(labelNames)*2)
	for idx, name := range labelNames {
		value := labelValues[idx]
		labels[name] = value
		parts = append(parts, name, value)
	}
	return strings.Join(parts, "\xff"), labels
}

func copyLabels(labels map[string]string) map[string]string {
	out := make(map[string]string, len(labels))
	maps.Copy(out, labels)
	return out
}

func sortedCounterSampleKeys(samples map[string]*counterSample) []string {
	keys := make([]string, 0, len(samples))
	for key := range samples {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedHistogramSampleKeys(samples map[string]*histogramSample) []string {
	keys := make([]string, 0, len(samples))
	for key := range samples {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func writeCounterMetric(w http.ResponseWriter, name string, help string, samples []counterSample) error {
	if _, err := fmt.Fprintf(w, "# HELP %s %s\n", name, help); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "# TYPE %s counter\n", name); err != nil {
		return err
	}
	for _, sample := range samples {
		if _, err := fmt.Fprintf(w, "%s%s %d\n", name, formatLabels(sample.labels), sample.value); err != nil {
			return err
		}
	}
	return nil
}

func writeHistogramMetric(w http.ResponseWriter, name string, help string, samples []histogramSample, bounds []float64) error {
	if _, err := fmt.Fprintf(w, "# HELP %s %s\n", name, help); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "# TYPE %s histogram\n", name); err != nil {
		return err
	}
	for _, sample := range samples {
		for idx, bound := range bounds {
			labels := copyLabels(sample.labels)
			labels["le"] = formatFloat(bound)
			if _, err := fmt.Fprintf(w, "%s_bucket%s %d\n", name, formatLabels(labels), sample.buckets[idx]); err != nil {
				return err
			}
		}
		labels := copyLabels(sample.labels)
		labels["le"] = "+Inf"
		if _, err := fmt.Fprintf(w, "%s_bucket%s %d\n", name, formatLabels(labels), sample.count); err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "%s_sum%s %s\n", name, formatLabels(sample.labels), formatFloat(sample.sum)); err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "%s_count%s %d\n", name, formatLabels(sample.labels), sample.count); err != nil {
			return err
		}
	}
	return nil
}

func formatLabels(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}

	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf(`%s=%q`, key, labels[key]))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}
