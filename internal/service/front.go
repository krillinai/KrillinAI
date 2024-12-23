package service

import (
	"fmt"
	"net/http"
	"net/url"
)

// ...existing code...

func RenderPage(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		link := r.FormValue("link")
		// 处理链接的后台HTTP请求
		resp, err := http.PostForm("http://127.0.0.1:8888/capability/subtitleTask", url.Values{"link": {link}})
		if err != nil {
			http.Error(w, "请求失败", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()
		// 处理响应...
		fmt.Fprintf(w, "请求成功，状态码：%d", resp.StatusCode)
		return
	}

	http.Error(w, "仅支持POST请求", http.StatusMethodNotAllowed)
}

// ...existing code...
