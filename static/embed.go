package static

import "embed"

//go:embed index.html background.jpg source/*.svg source/*.png
var EmbeddedFiles embed.FS
