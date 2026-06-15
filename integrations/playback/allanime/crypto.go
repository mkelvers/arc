package allanime

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	aesKeys = []string{"Xot36i3lK3:v1", "SimtVuagFbGR2K7P"}
)

func decryptTobeparsed(encoded string) ([]byte, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("base64 decode failed: %w", err)
	}

	if len(raw) < 29 {
		return nil, errors.New("encrypted payload too short")
	}

	version := raw[0]
	iv := raw[1:13]
	cipherText := raw[13 : len(raw)-16]

	for _, keyStr := range aesKeys {
		key := sha256.Sum256([]byte(keyStr))

		block, err := aes.NewCipher(key[:])
		if err != nil {
			continue
		}

		if version == 1 {
			plainText := tryDecryptCTR(block, iv, cipherText)
			if json.Valid(plainText) {
				return plainText, nil
			}
		}

		gcm, err := cipher.NewGCM(block)
		if err == nil {
			tag := raw[len(raw)-16:]
			combined := append(append([]byte{}, cipherText...), tag...)
			plainText, openErr := gcm.Open(nil, iv, combined, nil)
			if openErr == nil && json.Valid(plainText) {
				return plainText, nil
			}
		}
	}

	return nil, errors.New("decryption failed")
}

func tryDecryptCTR(block cipher.Block, iv []byte, cipherText []byte) []byte {
	ctrIV := append([]byte{}, iv...)
	ctrIV = append(ctrIV, 0x00, 0x00, 0x00, 0x02)
	ctr := cipher.NewCTR(block, ctrIV)
	plainText := make([]byte, len(cipherText))
	ctr.XORKeyStream(plainText, cipherText)
	return plainText
}

func decodeSourceURL(encoded string) string {
	if encoded == "" {
		return ""
	}

	encoded = strings.TrimPrefix(encoded, "--")

	substitutions := map[string]string{
		"79": "A", "7a": "B", "7b": "C", "7c": "D", "7d": "E",
		"7e": "F", "7f": "G", "70": "H", "71": "I", "72": "J",
		"73": "K", "74": "L", "75": "M", "76": "N", "77": "O",
		"68": "P", "69": "Q", "6a": "R", "6b": "S", "6c": "T",
		"6d": "U", "6e": "V", "6f": "W", "60": "X", "61": "Y",
		"62": "Z",
		"59": "a", "5a": "b", "5b": "c", "5c": "d", "5d": "e",
		"5e": "f", "5f": "g", "50": "h", "51": "i", "52": "j",
		"53": "k", "54": "l", "55": "m", "56": "n", "57": "o",
		"48": "p", "49": "q", "4a": "r", "4b": "s", "4c": "t",
		"4d": "u", "4e": "v", "4f": "w", "40": "x", "41": "y",
		"42": "z",
		"08": "0", "09": "1", "0a": "2", "0b": "3", "0c": "4",
		"0d": "5", "0e": "6", "0f": "7", "00": "8", "01": "9",
		"15": "-", "16": ".", "67": "_", "46": "~", "02": ":",
		"17": "/", "07": "?", "1b": "#", "63": "[", "65": "]",
		"78": "@", "19": "!", "1c": "$", "1e": "&", "10": "(",
		"11": ")", "12": "*", "13": "+", "14": ",", "03": ";",
		"05": "=", "1d": "%",
	}

	var result strings.Builder
	for idx := 0; idx < len(encoded); {
		if idx+2 <= len(encoded) {
			pair := encoded[idx : idx+2]
			if sub, ok := substitutions[pair]; ok {
				result.WriteString(sub)
				idx += 2
				continue
			}
		}

		result.WriteByte(encoded[idx])
		idx++
	}

	decoded := result.String()
	if strings.Contains(decoded, "/clock") && !strings.Contains(decoded, "/clock.json") {
		decoded = strings.Replace(decoded, "/clock", "/clock.json", 1)
	}

	return decoded
}

func responseFromTobeparsed(data map[string]any) (map[string]any, error) {
	toBeParsed := firstNonEmptyString(
		nestedString(data, "tobeparsed"),
		nestedString(data, "episode", "tobeparsed"),
	)
	if toBeParsed == "" {
		return nil, nil
	}

	decrypted, err := decryptTobeparsed(toBeParsed)
	if err != nil {
		return nil, fmt.Errorf("decrypt tobeparsed: %w", err)
	}

	parsed, err := parseGraphQLResponse(decrypted, "unmarshal decrypted")
	if err != nil {
		return nil, err
	}

	sourceURLs := firstNonEmptySlice(
		nestedSlice(parsed, "sourceUrls"),
		nestedSlice(parsed, "episode", "sourceUrls"),
	)
	if len(sourceURLs) == 0 {
		return nil, nil
	}

	return map[string]any{
		"episode": map[string]any{
			"sourceUrls": sourceURLs,
		},
	}, nil
}

func hasEpisodeSourceURLs(data map[string]any) bool {
	return len(nestedSlice(data, "episode", "sourceUrls")) > 0
}

func parseGraphQLResponse(respBody []byte, decodeErrPrefix string) (map[string]any, error) {
	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("%s: %w", decodeErrPrefix, err)
	}

	if errs, ok := parsed["errors"].([]any); ok && len(errs) > 0 {
		return nil, fmt.Errorf("graphql error: %v", errs[0])
	}

	return parsed, nil
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}

	return ""
}

func firstNonEmptySlice(values ...[]any) []any {
	for _, value := range values {
		if len(value) > 0 {
			return value
		}
	}

	return nil
}

func nestedString(data map[string]any, path ...string) string {
	value, ok := nestedValue(data, path...)
	if !ok {
		return ""
	}

	str, ok := value.(string)
	if !ok {
		return ""
	}

	return str
}

func nestedSlice(data map[string]any, path ...string) []any {
	value, ok := nestedValue(data, path...)
	if !ok {
		return nil
	}

	slice, ok := value.([]any)
	if !ok {
		return nil
	}

	return slice
}

func nestedValue(data map[string]any, path ...string) (any, bool) {
	var current any = data
	for _, key := range path {
		currentMap, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}

		current, ok = currentMap[key]
		if !ok {
			return nil, false
		}
	}

	return current, true
}
