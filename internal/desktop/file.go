package desktop

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/dialog"
)

type FileManager struct {
	window fyne.Window
	files  []string
}

func NewFileManager(window fyne.Window) *FileManager {
	return &FileManager{
		window: window,
		files:  make([]string, 0),
	}
}

func (fm *FileManager) ShowUploadDialog() {
	fd := dialog.NewFileOpen(func(reader fyne.URIReadCloser, err error) {
		if err != nil {
			dialog.ShowError(err, fm.window)
			return
		}
		if reader == nil {
			return
		}

		// 获取文件路径
		filePath := reader.URI().Path()
		fileName := filepath.Base(filePath)

		err = fm.uploadFile(filePath, fileName)
		if err != nil {
			dialog.ShowError(err, fm.window)
			return
		}

		dialog.ShowInformation("成功", "文件上传成功", fm.window)
	}, fm.window)

	fd.Show()
}

func (fm *FileManager) uploadFile(filePath, fileName string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	// 创建multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return err
	}
	_, err = io.Copy(part, file)
	if err != nil {
		return err
	}
	writer.Close()

	// 发送请求
	resp, err := http.Post("http://localhost:8888/api/file", writer.FormDataContentType(), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			FilePath string `json:"file_path"`
		} `json:"data"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return err
	}

	if result.Error != 0 && result.Error != 200 {
		return fmt.Errorf(result.Msg)
	}

	fm.files = append(fm.files, result.Data.FilePath)
	return nil
}

func (fm *FileManager) GetFileCount() int {
	return len(fm.files)
}

func (fm *FileManager) GetFileName(index int) string {
	if index < 0 || index >= len(fm.files) {
		return ""
	}
	return filepath.Base(fm.files[index])
}

func (fm *FileManager) DownloadFile(index int) {
	if index < 0 || index >= len(fm.files) {
		return
	}

	filePath := fm.files[index]

	dialog.ShowFileSave(func(writer fyne.URIWriteCloser, err error) {
		if err != nil {
			dialog.ShowError(err, fm.window)
			return
		}
		if writer == nil {
			return
		}

		resp, err := http.Get("http://localhost:8888" + filePath)
		if err != nil {
			dialog.ShowError(err, fm.window)
			return
		}
		defer resp.Body.Close()

		_, err = io.Copy(writer, resp.Body)
		if err != nil {
			dialog.ShowError(err, fm.window)
			return
		}

		writer.Close()
		dialog.ShowInformation("成功", "文件下载完成", fm.window)
	}, fm.window)
}
