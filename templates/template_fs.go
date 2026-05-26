package templates

import "embed"

//go:embed *.gohtml anime/*.gohtml components/*.gohtml
var templateFS embed.FS

