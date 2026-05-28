package templates

import "embed"

//go:embed *.gohtml components/*.gohtml
var templateFS embed.FS
