package allanime

//go:generate go tool genqlient genqlient.yaml

import (
	"bytes"
	"encoding/json"
	"strconv"
)

type FlexibleInt string

type Object []byte

type SearchInput struct {
	AllowAdult   bool     `json:"allowAdult"`
	AllowUnknown bool     `json:"allowUnknown"`
	IncludeTypes bool     `json:"includeTypes,omitempty"`
	Query        string   `json:"query,omitempty"`
	Season       string   `json:"season,omitempty"`
	Types        []string `json:"types,omitempty"`
}

func (n FlexibleInt) Int() int {
	value, _ := strconv.ParseFloat(string(n), 64)
	return int(value)
}

func (n FlexibleInt) String() string {
	return string(n)
}

func (n FlexibleInt) MarshalJSON() ([]byte, error) {
	if n == "" {
		return []byte("0"), nil
	}
	return []byte(n), nil
}

func (n *FlexibleInt) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) || len(data) == 0 {
		*n = ""
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		if text == "" {
			*n = ""
			return nil
		}
		if _, err := strconv.ParseFloat(text, 64); err != nil {
			return err
		}
		*n = FlexibleInt(text)
		return nil
	}

	if _, err := strconv.ParseFloat(string(data), 64); err != nil {
		return err
	}
	*n = FlexibleInt(data)
	return nil
}

func (o Object) Decode(value any) error {
	data := bytes.TrimSpace(o)
	if len(data) == 0 || bytes.Equal(data, []byte("null")) {
		return nil
	}
	return json.Unmarshal(data, value)
}

func (o Object) MarshalJSON() ([]byte, error) {
	if len(o) == 0 {
		return []byte("null"), nil
	}
	return o, nil
}

func (o *Object) UnmarshalJSON(data []byte) error {
	*o = append((*o)[:0], data...)
	return nil
}
