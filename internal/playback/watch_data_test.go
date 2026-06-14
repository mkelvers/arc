package playback

import (
	"testing"
)

func TestFallbackModes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mode string
		want []string
	}{
		{name: "sub falls back to dub", mode: "sub", want: []string{"dub"}},
		{name: "dub falls back to sub", mode: "dub", want: []string{"sub"}},
		{name: "unknown tries both canonical modes", mode: "raw", want: []string{"sub", "dub"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := fallbackModes(tt.mode)
			if len(got) != len(tt.want) {
				t.Fatalf("len(got) = %d, want %d", len(got), len(tt.want))
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Fatalf("got[%d] = %q, want %q", i, got[i], want)
				}
			}
		})
	}
}
