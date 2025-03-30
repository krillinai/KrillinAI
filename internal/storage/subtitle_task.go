package storage

import (
	"sync"
)

var SubtitleTasks = sync.Map{} // task id -> SubtitleTask，用于接口查询数据
