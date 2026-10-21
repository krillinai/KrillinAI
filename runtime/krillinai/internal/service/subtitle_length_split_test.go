package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func TestBoundaryReviewReceivesOnlyParentScopedTermMeanings(t *testing.T) {
	parent := pairedSentence{ID: "1", FullSource: "This capacitor is rated in farads.", FullTarget: "这个电容的单位是法拉。"}
	input := lengthSplitTestInput(parent, 65)
	input.SemanticContext = &translationBatchSemanticContext{Terms: []translationSemanticTerm{{Source: "farads", Target: "法拉", Meaning: "电容量单位", SentenceIDs: []string{"1"}}, {Source: "bank", Target: "河岸", Meaning: "另一句的河岸", SentenceIDs: []string{"2"}}}}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		var payload struct {
			Terms []translationSemanticTerm `json:"terms"`
		}
		if err := semanticTestPayload(prompt, &payload); err != nil {
			return "", err
		}
		if len(payload.Terms) != 1 || payload.Terms[0].Meaning != "电容量单位" {
			t.Fatalf("边界核验丢失或泄漏术语释义: %+v", payload)
		}
		return `{"acceptable":true,"reason":"按适用词义核对逐段内容"}`, nil
	})}
	if ok, _, err := translator.reviewLengthBoundaries(context.Background(), input, parent, parent); err != nil || !ok {
		t.Fatalf("边界核验失败: %v", err)
	}
}

func TestFinalBoundariesRejectOpenChineseComplements(t *testing.T) {
	for _, marker := range []string{"当作", "视为", "看作", "称为"} {
		source := "I treat reading as finishing a book."
		left, right := "我把阅读"+marker, "读完一本书。"
		input := pairedTranslationInput{MaxTargetChars: 75, PreserveFinalBoundaries: true, Sentences: []pairedTranslationSource{{ID: "1", Text: source, TargetText: left + right}}}
		data, _ := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: left + right, Source: []string{"I treat reading", "as finishing a book."}, Target: []string{left, right}}})
		if _, err := (&Translator{}).parsePairedTranslation(string(data), input, "en", "zh_cn"); err == nil {
			t.Fatalf("放过悬空补语：%s / %s", left, right)
		}
		if subtitleBoundaryLeavesComplement(left + "——") {
			t.Fatal("误判明确的口语中断")
		}
	}
}

func TestLocalRewriteCannotRepeatAnotherParentCue(t *testing.T) {
	for _, languageText := range []string{"从头到尾读完每一个字，", "read every single word,", "毎日少しずつ読み続ける、", "اقرأ كل كلمة بعناية"} {
		if !newPairedTargetRepetition(languageText+"Then finish.", []string{languageText, languageText, "Then finish."}) {
			t.Fatalf("未拒绝新增父句重复: %s", languageText)
		}
		if newPairedTargetRepetition(languageText+languageText, []string{languageText, languageText}) {
			t.Fatalf("错误拒绝既有强调重复: %s", languageText)
		}
	}
	original := pairedSentence{ID: "1", FullSource: "Open the book and follow through, and read every single word until you reach the very end of this rather lengthy book.", FullTarget: "从头到尾读完每一个字，直到读完为止。", Source: []string{"Open the book and follow through,", "and read every single word until you reach the very end of this rather lengthy book."}, Target: []string{"从头到尾读完每一个字，", "直到读完为止。"}}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_split\n") {
			return `{"sentences":[{"sentence_id":"1","segments":[{"source":"and read every single word","target":"从头到尾读完每一个字，"},{"source":"until you reach the very end of this rather lengthy book.","target":"直到读完为止。"}]}]}`, nil
		}
		t.Fatal("新增重复没有在模型复核前被拒绝")
		return "", nil
	})}
	_, err := translator.splitLongPairedSegment(context.Background(), lengthSplitTestInput(original, 65), original, pairedTranslationSource{ID: "1", Text: original.Source[1], TargetText: original.Target[1]}, "en", "zh_cn")
	if !errors.Is(err, errFinalLayoutExhausted) || !strings.Contains(err.Error(), "新增重复译文") {
		t.Fatalf("重复局部改写未拒绝: %v", err)
	}
}

func TestFinalLengthBoundariesAreNotSoftMerged(t *testing.T) {
	source := "and different authors about different things, fiction, non-fiction, whatever it might be."
	target := "不同作者、不同内容——虚构、非虚构，无论是什么。"
	input := pairedTranslationInput{MaxTargetChars: 75, PreserveFinalBoundaries: true, Sentences: []pairedTranslationSource{{ID: "17", Text: source, TargetText: target}}}
	data, _ := encodePairedTestResponse([]pairedSentence{{ID: "17", FullTarget: target, Source: []string{"and different authors about different things, fiction, non-fiction,", "whatever it might be."}, Target: []string{"不同作者、不同内容——虚构、非虚构，", "无论是什么。"}}})
	got, err := (&Translator{}).parsePairedTranslation(string(data), input, "en", "zh_cn")
	if err != nil || len(got) != 1 || len(got[0].Source) != 2 || pairedFinalLengthIssue(got[0]) != nil {
		t.Fatalf("最终切口被软优化重新合成超长字幕: %+v err=%v", got, err)
	}
}

func TestLengthSplitUsesOneCandidateAndKeepsFrozenCoverage(t *testing.T) {
	source := pairedTranslationSource{ID: "6", Text: "That is the framework you need round you in order to sustain a reading habit.", TargetText: "这就是你为了维持阅读习惯所需要的环境。"}
	response := `{"sentences":[{"sentence_id":"6","segments":[{"source":"That is the framework you need round you","target":"你身边需要这样的环境，"},{"source":"in order to sustain a reading habit.","target":"以维持阅读习惯。"}]}]}`
	input := pairedTranslationInput{MaxTargetChars: 75, PreserveFinalBoundaries: true, Sentences: []pairedTranslationSource{source}}
	translator := &Translator{}
	if _, err := translator.parsePairedTranslation(normalizeLengthSplitResponse(response, source, "zh_cn", false), input, "en", "zh_cn"); err == nil {
		t.Fatal("冻结模式接受了不同措辞")
	}
	input.Sentences[0].TargetText = ""
	got, err := translator.parsePairedTranslation(normalizeLengthSplitResponse(response, source, "zh_cn", true), input, "en", "zh_cn")
	if err != nil || got[0].FullTarget != "你身边需要这样的环境，以维持阅读习惯。" {
		t.Fatalf("未形成唯一待核验候选: %+v err=%v", got, err)
	}
}

func TestFinalLengthRecoversAcrossParentPairsWithIndependentReview(t *testing.T) {
	first := "We need a large collection of books on different subjects and genres,"
	last := "and different authors about different things, fiction, non-fiction, whatever it might be."
	original := pairedSentence{ID: "17", FullSource: first + " " + last, FullTarget: "我们需要涵盖不同主题与体裁、作者和内容各异——虚构、非虚构，无论哪一类——的大量藏书。", Source: []string{first, last}, Target: []string{"我们需要涵盖不同主题与体裁、", "作者和内容各异——虚构、非虚构，无论哪一类——的大量藏书。"}, DraftTarget: "保留初译", RevisionVersion: "保留修订版本", SemanticReviewed: true, LayoutReviewed: true}
	for _, approve := range []bool{true, false} {
		splits, verifications := 0, 0
		translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
			if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
				verifications++
				if !strings.Contains(prompt, `"source_text":"`+original.FullSource+`"`) {
					t.Fatal("跨配对调整没有核验全部原文")
				}
				return fmt.Sprintf(`{"equivalent":%t,"reason":"核对完整父句的藏书、主题、体裁、作者及虚构分类"}`, approve), nil
			}
			if response, ok := neutralSemanticTestResponse(prompt); ok {
				return response, nil
			}
			splits++
			var request subtitleLengthSplitInput
			if err := semanticTestPayload(prompt, &request); err != nil {
				return "", err
			}
			input := request.Sentences[0]
			item := pairedSentence{ID: "17", FullTarget: request.OriginalTarget, Source: []string{input.Text}, Target: []string{request.OriginalTarget}}
			if input.Text == original.FullSource && request.AllowTargetRewrite {
				item.FullTarget = "我们需要大量藏书，涵盖不同主题与体裁，作者和内容各异，包括虚构和非虚构，无论哪一类。"
				item.Source = []string{"We need a large collection of books", "on different subjects and genres,", "and different authors about different things, fiction, non-fiction,", "whatever it might be."}
				item.Target = []string{"我们需要大量藏书，", "涵盖不同主题与体裁，", "作者和内容各异，包括虚构和非虚构，", "无论哪一类。"}
			}
			data, err := encodePairedTestResponse([]pairedSentence{item})
			return string(data), err
		})}
		sentences := map[string]pairedSentence{"17": original}
		completed := false
		err := translator.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 65), sentences, "en", "zh_cn", func(_ pairedSentence, complete bool) error { completed = completed || complete; return nil })
		got := sentences["17"]
		if approve {
			if err != nil || !completed || splits != 4 || verifications != 1 || len(got.Source) != 4 || got.DraftTarget != original.DraftTarget || got.RevisionVersion != original.RevisionVersion || pairedFinalLengthIssue(got) != nil {
				t.Fatalf("整父句恢复失败: %+v splits=%d verify=%d err=%v", got, splits, verifications, err)
			}
		} else if err != nil || !completed || got.FullTarget != original.FullTarget || !slices.Equal(got.Source, original.Source) || !slices.Equal(got.Target, original.Target) || !got.LayoutFallback || verifications != 3 {
			t.Fatalf("核验拒绝仍采用跨配对改写: %+v completed=%v verify=%d err=%v", got, completed, verifications, err)
		}
	}
}

func lengthSplitTestInput(original pairedSentence, limit int) pairedTranslationInput {
	return pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxSourceChars: limit, MaxTargetChars: limit, Sentences: []pairedTranslationSource{{ID: original.ID, Text: original.FullSource, NLPSourceHint: original.NLPSourceHint}}}
}

func TestSubtitleLengthPassKeepsCompliantUnitsWithoutRequests(t *testing.T) {
	for _, source := range []string{strings.Repeat("x", 75), "这些书都还没有读完。", "هذه الكتب لم تكتمل بعد", "これらの本はまだ読み終わっていません。"} {
		original := pairedSentence{ID: "1", FullSource: source, FullTarget: "这些书都还没有读完。", Source: []string{source}, Target: []string{"这些书都还没有读完。"}, SemanticReviewed: true, LayoutReviewed: true}
		translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) { t.Fatal("合格字幕不应再次请求模型"); return "", nil })}
		completed := 0
		err := translator.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 65), map[string]pairedSentence{"1": original}, "en", "zh_cn", func(s pairedSentence, complete bool) error {
			if complete {
				completed++
			}
			if s.FullTarget != original.FullTarget || s.Source[0] != source {
				t.Fatal("合格片段被修改")
			}
			return nil
		})
		if err != nil || completed != 1 {
			t.Fatalf("completed=%d err=%v", completed, err)
		}
	}
}

func TestSubtitleLengthPassRechecksAndOnlySplitsLongPair(t *testing.T) {
	longSource := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	longTarget := "因为它们是永恒的，它们以非常普遍的哲学术语谈论当代道德，"
	original := pairedSentence{ID: "7", FullSource: "I read books, " + longSource + " and I learn.", FullTarget: "我读书，因为它们是永恒的，它们以非常普遍的哲学术语谈论当代道德，而且我有所收获。", Source: []string{"I read books,", longSource, "and I learn."}, Target: []string{"我读书，", longTarget, "而且我有所收获。"}, SemanticReviewed: true, LayoutReviewed: true}
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		var request subtitleLengthSplitInput
		if err := semanticTestPayload(prompt, &request); err != nil {
			return "", err
		}
		if request.MaxDisplayUnits != 75 || request.Sentences[0].Text != longSource || (calls == 1 && request.Sentences[0].TargetText != longTarget) || request.ParentSource != original.FullSource || request.AllowTargetRewrite != (calls > 1) {
			t.Fatalf("重拆影响了其他片段或未冻结译文: %+v", request)
		}
		item := pairedSentence{ID: "7", FullTarget: longTarget, Source: []string{longSource}, Target: []string{longTarget}}
		if calls > 1 {
			if !strings.Contains(request.PreviousIssue, "超过单行上限75") {
				t.Fatal("没有再次检查仍然超长的响应")
			}
			item.Source = []string{"because they are timeless", "and they speak in very general philosophical terms", "about contemporary morals,"}
			item.Target = []string{"因为它们是永恒的，", "它们以非常普遍的哲学术语", "谈论当代道德，"}
		}
		data, err := encodePairedTestResponse([]pairedSentence{item})
		return string(data), err
	})}
	sentences := map[string]pairedSentence{"7": original}
	err := translator.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 65), sentences, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	got := sentences["7"]
	if err != nil || calls != 2 || len(got.Source) != 5 || got.FullTarget != original.FullTarget || got.Source[0] != original.Source[0] || got.Source[4] != original.Source[2] || got.LayoutFallback || pairedFinalLengthIssue(got) != nil {
		t.Fatalf("calls=%d got=%+v err=%v", calls, got, err)
	}
}

func TestSubtitleLengthPassChecksTranslationWidthToo(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "I read many books, and I discuss them with friends.", FullTarget: strings.Repeat("甲", 19) + "，" + strings.Repeat("乙", 18) + "。", Source: []string{"I read many books, and I discuss them with friends."}}
	original.Target = []string{original.FullTarget}
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: original.FullTarget, Source: []string{"I read many books,", "and I discuss them with friends."}, Target: []string{strings.Repeat("甲", 19) + "，", strings.Repeat("乙", 18) + "。"}}})
		return string(data), err
	})}
	sentences := map[string]pairedSentence{"1": original}
	err := translator.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 75), sentences, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	if err != nil || calls != 1 || len(sentences["1"].Target) != 2 || !sentences["1"].LayoutReviewed || pairedFinalLengthIssue(sentences["1"]) != nil {
		t.Fatalf("calls=%d got=%+v err=%v", calls, sentences["1"], err)
	}
}

func TestSubtitleLengthPassReordersOnlyAfterFrozenAttemptsAndReview(t *testing.T) {
	source := "It feels like you're not allowed almost to go on to the next book until you have finished the one you've got in your hand."
	target := "感觉就像是你没读完手里的那本书，就几乎不被允许去读下一本。"
	rewritten := "感觉就像是你几乎不被允许去读下一本书，直到你读完手里这本。"
	for _, approve := range []bool{true, false} {
		original := pairedSentence{ID: "13", FullSource: "Well, " + source + " Thanks.", FullTarget: "那么，" + target + "谢谢。", Source: []string{"Well,", source, "Thanks."}, Target: []string{"那么，", target, "谢谢。"}, SemanticReviewed: true, LayoutReviewed: true, LayoutFallback: true}
		calls, reviews := 0, 0
		translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
			if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
				reviews++
				data, err := json.Marshal(map[string]any{"equivalent": approve, "reason": "核对条件、否定与全部信息"})
				return string(data), err
			}
			calls++
			var request subtitleLengthSplitInput
			if err := semanticTestPayload(prompt, &request); err != nil {
				return "", err
			}
			if request.Sentences[0].Text == original.FullSource {
				return "", errors.New("整父句修正服务不可用") // 核验失败后仍保留原译。
			}
			item := pairedSentence{ID: "13", FullTarget: target, Source: []string{source}, Target: []string{target}}
			if calls == 1 {
				if request.AllowTargetRewrite || request.Sentences[0].TargetText != target {
					t.Fatal("未优先保留已有完整译文")
				}
			} else {
				if !request.AllowTargetRewrite || request.Sentences[0].TargetText != "" || request.OriginalTarget != target {
					t.Fatal("局部改写没有保留原译参照或仍被错误锁定")
				}
				if calls == 3 {
					// 模型在segments改写，却忘记同步target_text；只在已授权的
					// 改写模式形成统一候选全文，并交给独立语义复核。
					item.Source = []string{"It feels like you're not allowed almost to go on to the next book", "until you have finished the one you've got in your hand."}
					item.Target = []string{"感觉就像是你几乎不被允许去读下一本书，", "直到你读完手里这本。"}
				}
			}
			data, err := encodePairedTestResponse([]pairedSentence{item})
			return string(data), err
		})}
		sentences := map[string]pairedSentence{"13": original}
		completed := false
		err := translator.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 65), sentences, "en", "zh_cn", func(value pairedSentence, complete bool) error { completed = completed || complete; return nil })
		wantCalls := 3
		if !approve {
			wantCalls++
		}
		if calls != wantCalls || reviews != 1 || !completed {
			t.Fatalf("approve=%v calls=%d reviews=%d completed=%v err=%v", approve, calls, reviews, completed, err)
		}
		if approve {
			got := sentences["13"]
			if err != nil || got.FullTarget != "那么，"+rewritten+"谢谢。" || len(got.Source) != 4 || got.Source[0] != "Well," || got.Source[3] != "Thanks." || got.Target[0] != "那么，" || got.Target[3] != "谢谢。" || pairedFinalLengthIssue(got) != nil {
				t.Fatalf("未应用通过复核的局部调整: %+v err=%v", sentences["13"], err)
			}
		} else if err != nil || sentences["13"].FullTarget != original.FullTarget || !slices.Equal(sentences["13"].Source, original.Source) || !slices.Equal(sentences["13"].Target, original.Target) {
			t.Fatal("复核失败后未沿用完整原译及原分段")
		}
	}
}

func TestSubtitleLengthPassBoundaryReviewRetriesUnnaturalCuts(t *testing.T) {
	source := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	target := "因为它们是永恒的，它们以非常普遍的哲学术语谈论当代道德，"
	original := pairedSentence{ID: "7", FullSource: "I read books, " + source, FullTarget: "我读书，" + target, Source: []string{"I read books,", source}, Target: []string{"我读书，", target}, SemanticReviewed: true, LayoutReviewed: true}
	reviews, splits := 0, 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n") {
			reviews++
			var request struct {
				Candidate pairedSentence `json:"candidate"`
			}
			if err := semanticTestPayload(prompt, &request); err != nil {
				return "", err
			}
			if request.Candidate.FullSource != source || request.Candidate.FullTarget != target {
				t.Fatal("新增切口的审校涉及了其他合格配对")
			}
			response, err := json.Marshal(map[string]any{"acceptable": reviews > 1, "reason": "第一版拆开‘非常普遍的哲学术语’，第二版保持完整短语。"})
			return string(response), err
		}
		splits++
		item := pairedSentence{ID: "7", FullTarget: target, Source: []string{"because they are timeless", "and they speak in very general philosophical terms", "about contemporary morals,"}, Target: []string{"因为它们是永恒的，", "它们以非常普遍的哲学术语", "谈论当代道德，"}}
		if splits == 1 {
			item.Source = []string{"because they are timeless and they speak", "in very general philosophical terms about contemporary morals,"}
			item.Target = []string{"因为它们是永恒的，它们以非常普遍的", "哲学术语谈论当代道德，"}
		}
		data, err := encodePairedTestResponse([]pairedSentence{item})
		return string(data), err
	})}
	sentences := map[string]pairedSentence{"7": original}
	err := translator.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 65), sentences, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	got := sentences["7"]
	if err != nil || reviews != 2 || splits != 2 || len(got.Source) != 4 || got.Source[0] != original.Source[0] || got.Target[0] != original.Target[0] || got.FullTarget != original.FullTarget || !got.LayoutReviewed || pairedFinalLengthIssue(got) != nil {
		t.Fatalf("审校重新引入超长或修改了其他片段: %+v reviews=%d err=%v", got, reviews, err)
	}
}

func TestSubtitleLengthPassFailureKeepsOriginalUnlessCanceled(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: strings.Repeat("long phrase ", 10), FullTarget: "完整译文不能丢失。", Source: []string{strings.TrimSpace(strings.Repeat("long phrase ", 10))}, Target: []string{"完整译文不能丢失。"}}
	for _, cancel := range []bool{false, true} {
		ctx, stop := context.WithCancel(context.Background())
		calls := 0
		translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
			calls++
			if cancel {
				stop()
			}
			return "", errors.New("模型连接中断")
		})}
		var pending pairedSentence
		completed := false
		err := translator.splitLongPairedSubtitles(ctx, lengthSplitTestInput(original, 65), map[string]pairedSentence{"1": original}, "en", "zh_cn", func(value pairedSentence, complete bool) error {
			completed = completed || complete
			pending = value
			return nil
		})
		stop()
		if calls != 1 || pending.FullTarget != original.FullTarget || !slices.Equal(pending.Source, original.Source) || !slices.Equal(pending.Target, original.Target) || !pending.LayoutFallback || completed == cancel || cancel && !errors.Is(err, context.Canceled) || !cancel && err != nil {
			t.Fatalf("pending=%+v calls=%d err=%v", pending, calls, err)
		}
	}
}

func TestSubtitleLengthPassRejectsChangedScopedTerm(t *testing.T) {
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) { t.Fatal("丢失已确认术语应直接拒绝"); return "", nil })}
	input := pairedTranslationInput{SemanticContext: &translationBatchSemanticContext{Terms: []translationSemanticTerm{{Source: "Mapping Ideology", Target: "《图绘意识形态》", SentenceIDs: []string{"1"}}}}}
	ok, _, err := translator.reviewLengthRewrite(context.Background(), input, pairedSentence{}, pairedTranslationSource{ID: "1", TargetText: "我还有《图绘意识形态》。"}, "我还有《意识形态的崇高对象》。", "zh_cn")
	if err != nil || ok {
		t.Fatalf("丢失正确书名仍通过: %v %v", ok, err)
	}
}
