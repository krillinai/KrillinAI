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
	"fyne.io/fyne/v2/storage"
)

type FileManager struct {
	window        fyne.Window
	files         []string
	selectedFiles []string // 多文件选择
}

func NewFileManager(window fyne.Window) *FileManager {
	return &FileManager{
		window:        window,
		files:         make([]string, 0),
		selectedFiles: make([]string, 0),
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

func (fm *FileManager) ShowMultiUploadDialog() {
	// 清空已选择的文件
	fm.selectedFiles = make([]string, 0)

	fm.showAddFileDialog()
}

func (fm *FileManager) showAddFileDialog() {
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
		fm.selectedFiles = append(fm.selectedFiles, filePath)
		reader.Close()

		// 是否继续添加文件
		continueDialog := dialog.NewConfirm(
			"添加更多文件",
			fmt.Sprintf("已选择 %d 个文件。是否继续添加？", len(fm.selectedFiles)),
			func(cont bool) {
				if cont {
					// 继续添加文件
					fm.showAddFileDialog()
				} else {
					// 上传
					if len(fm.selectedFiles) > 0 {
						// 文件名列表
						fileNames := make([]string, len(fm.selectedFiles))
						for i, path := range fm.selectedFiles {
							fileNames[i] = filepath.Base(path)
						}

						// 上传
						err := fm.uploadMultipleFiles(fm.selectedFiles, fileNames)
						if err != nil {
							dialog.ShowError(err, fm.window)
							return
						}

						dialog.ShowInformation("成功", fmt.Sprintf("已上传 %d 个文件", len(fm.selectedFiles)), fm.window)
					}
				}
			},
			fm.window,
		)
		continueDialog.Show()
	}, fm.window)

	fd.SetFilter(storage.NewExtensionFileFilter([]string{".mp4", ".mov", ".avi", ".mkv", ".wmv"}))
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

func (fm *FileManager) uploadMultipleFiles(filePaths []string, fileNames []string) error {
	// 显示上传进度对话框
	progress := dialog.NewProgress("上传中", "正在上传文件...", fm.window)
	progress.Show()
	defer progress.Hide()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	for i, filePath := range filePaths {
		file, err := os.Open(filePath)
		if err != nil {
			return err
		}

		part, err := writer.CreateFormFile("file", fileNames[i])
		if err != nil {
			file.Close()
			return err
		}

		_, err = io.Copy(part, file)
		file.Close()
		if err != nil {
			return err
		}

		progress.SetValue(float64(i+1) / float64(len(filePaths)))
	}
	writer.Close()

	resp, err := http.Post("http://localhost:8888/api/file", writer.FormDataContentType(), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			FilePath []string `json:"file_path"`
		} `json:"data"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return err
	}

	if result.Error != 0 && result.Error != 200 {
		return fmt.Errorf(result.Msg)
	}

	fm.files = append(fm.files, result.Data.FilePath...)
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
