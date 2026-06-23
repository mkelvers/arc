package allanime

import (
	"reflect"
	"testing"
)

func TestParseEpisodeNumbersKeepsOnlyPositiveIntegers(t *testing.T) {
	got := episodeNums([]string{"1", " 2 ", "2", "0", "-1", "12.5", "SP1", "6"})
	want := []int{1, 2, 6}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("episodeNums() = %v, want %v", got, want)
	}
}
