package allanimeql

//go:generate go tool genqlient genqlient.yaml

import (
	"bytes"
	"encoding/json"
	"strconv"
)

type FlexibleInt int

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
	return int(n)
}

func (n FlexibleInt) MarshalJSON() ([]byte, error) {
	return []byte(strconv.Itoa(int(n))), nil
}

func (n *FlexibleInt) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) || len(data) == 0 {
		*n = 0
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		if text == "" {
			*n = 0
			return nil
		}
		value, err := strconv.ParseFloat(text, 64)
		if err != nil {
			return err
		}
		*n = FlexibleInt(value)
		return nil
	}

	value, err := strconv.ParseFloat(string(data), 64)
	if err != nil {
		return err
	}
	*n = FlexibleInt(value)
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
