package util

type Queue[T any] interface {
	Enqueue(item T) bool
	Dequeue() (T, bool)
	IsEmpty() bool
	IsFull() bool
	Size() int
	Peek() (T, bool) // 可选，根据需求添加
}

type CircularQueue[T any] struct {
	data  []T
	front int // 队首指针
	rear  int // 队尾指针
	count int // 跟踪元素数量
}

// 创建一个新的循环队列
func NewCircularQueue[T any](maxSize int) *CircularQueue[T] {
	return &CircularQueue[T]{
		data:  make([]T, maxSize),
		front: 0,
		rear:  0,
		count: 0,
	}
}

func (q *CircularQueue[T]) IsEmpty() bool { return q.count == 0 }
func (q *CircularQueue[T]) IsFull() bool  { return q.count == len(q.data) }
func (q *CircularQueue[T]) Size() int     { return q.count }

func (q *CircularQueue[T]) Enqueue(item T) bool {
	if q.IsFull() {
		return false
	}
	q.data[q.rear] = item
	q.rear = (q.rear + 1) % len(q.data)
	q.count++
	return true
}

func (q *CircularQueue[T]) Dequeue() (T, bool) {
	var zero T
	if q.IsEmpty() {
		return zero, false
	}
	item := q.data[q.front]
	q.front = (q.front + 1) % len(q.data)
	q.count--
	return item, true
}

func (q *CircularQueue[T]) Peek() (T, bool) {
	var zero T
	if q.IsEmpty() {
		return zero, false
	}
	return q.data[q.front], true
}
