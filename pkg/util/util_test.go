package util

import (
	"fmt"
	"testing"
)

func TestSplitSentence(t *testing.T) {
	testText := `这有一个14,000千克的集装箱。The U.S. sent to me. 现在是 11:23 p.m. 重复，11.23 p.m. 我身高1.8米。But it also makes communications with a submarine almost impossible. The high frequency signals that surface ships use for communications can transmit large amounts of data while being encrypted and resistant to jamming.`

	sentences := SplitTextSentences(testText)

	for i, s := range sentences {
		fmt.Printf("句子 %d: %s\n", i+1, s)
	}
}
