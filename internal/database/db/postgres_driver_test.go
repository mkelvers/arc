package db

import "testing"

func TestReplaceQuestionMarks(t *testing.T) {
	tests := map[string]string{
		"SELECT * FROM thing WHERE id = ? AND name = ?":               "SELECT * FROM thing WHERE id = $1 AND name = $2",
		"SELECT * FROM thing WHERE id = ?1 AND name = ?2 AND id = ?1": "SELECT * FROM thing WHERE id = $1 AND name = $2 AND id = $1",
		"SELECT '?' AS literal, \"?\" AS identifier, value = ?":       "SELECT '?' AS literal, \"?\" AS identifier, value = $1",
	}

	for query, want := range tests {
		if got := replaceQuestionMarks(query); got != want {
			t.Errorf("replaceQuestionMarks(%q) = %q, want %q", query, got, want)
		}
	}
}
