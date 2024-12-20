package static

import "embed"

//go:embed index.html background.jpg
var EmbeddedFiles embed.FS
