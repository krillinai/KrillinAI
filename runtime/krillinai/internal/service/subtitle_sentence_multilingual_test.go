package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"reflect"
	"strings"
	"testing"
)

func TestTranslationSentenceSourceLanguage(t *testing.T) {
	for _, tc := range []struct {
		name, language, text string
		want                 []string
	}{
		{"德语日期", "de", "Am 3. Oktober treffen wir uns. Danach gehen wir.", []string{"Am 3. Oktober treffen wir uns.", "Danach gehen wir."}},
		{"德语月份缩写与年份", "de-DE", "Am 3. Okt. 2026 treffen wir uns. Danach gehen wir.", []string{"Am 3. Okt. 2026 treffen wir uns.", "Danach gehen wir."}},
		{"月份缩写真实句末", "de", "Wir treffen uns am 3. Okt. Danach gehen wir.", []string{"Wir treffen uns am 3. Okt.", "Danach gehen wir."}},
		{"德语多点缩写", "de", "Das ist z. B. eine Lösung. Danach gehen wir.", []string{"Das ist z. B. eine Lösung.", "Danach gehen wir."}},
		{"德语无空格缩写", "de", "Das ist z.B. Berlin. Danach gehen wir.", []string{"Das ist z.B. Berlin.", "Danach gehen wir."}},
		{"法语称谓", "fr_FR", "Mme. Dupont arrive. Elle repart demain.", []string{"Mme. Dupont arrive.", "Elle repart demain."}},
		{"法语多点缩写", "fr", "Prenez p. ex. Paris. Ensuite, partez.", []string{"Prenez p. ex. Paris.", "Ensuite, partez."}},
		{"西语称谓", "es", "La Sra. García llegó. Después salió.", []string{"La Sra. García llegó.", "Después salió."}},
		{"葡语称谓", "pt-BR", "A Sra. Silva chegou. Depois saiu.", []string{"A Sra. Silva chegou.", "Depois saiu."}},
		{"意语称谓", "it", "La Dott.ssa Rossi arriva. Poi riparte.", []string{"La Dott.ssa Rossi arriva.", "Poi riparte."}},
		{"俄语称谓", "ru", "Проф. Иванов пришёл. Потом ушёл.", []string{"Проф. Иванов пришёл.", "Потом ушёл."}},
		{"乌克兰语称谓", "uk", "Проф. Іванов прийшов. Потім пішов.", []string{"Проф. Іванов прийшов.", "Потім пішов."}},
		{"印地语称谓", "hi", "डॉ. शर्मा आज आएंगे। हम उनसे बात करेंगे।", []string{"डॉ. शर्मा आज आएंगे।", "हम उनसे बात करेंगे।"}},
		{"捷克语日期", "cs", "Sejdeme se 3. října. Potom odejdeme.", []string{"Sejdeme se 3. října.", "Potom odejdeme."}},
		{"丹麦语日期", "da", "Vi ses den 3. oktober. Så går vi.", []string{"Vi ses den 3. oktober.", "Så går vi."}},
		{"德语真实短句", "de", "Ja. Nein. Gut. Wir gehen.", []string{"Ja.", "Nein.", "Gut.", "Wir gehen."}},
		{"缩写真实句末", "de", "Wir kaufen Obst usw. Danach gehen wir.", []string{"Wir kaufen Obst usw.", "Danach gehen wir."}},
		{"词尾不是称谓", "fr", "Le programme. Demain arrive.", []string{"Le programme.", "Demain arrive."}},
		{"引号内称谓不合并后句", "fr", "Elle dit «Mme.» Ensuite elle part.", []string{"Elle dit «Mme.»", "Ensuite elle part."}},
		{"日语句界", "ja", "今日は天気が悪いので、明日出発します。でも、準備は今日中に終わらせます。", []string{"今日は天気が悪いので、明日出発します。", "でも、準備は今日中に終わらせます。"}},
		{"泰语无确定句界保留原文", "th", "วันนี้ฝนตกหนักจึงยังออกไปวิ่งไม่ได้ พรุ่งนี้เราจะลองอีกครั้ง", []string{"วันนี้ฝนตกหนักจึงยังออกไปวิ่งไม่ได้ พรุ่งนี้เราจะลองอีกครั้ง"}},
		{"未知语言退回通用规则", "unknown", "Hello. Goodbye!", []string{"Hello.", "Goodbye!"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			language := types.StandardLanguageCode(tc.language)
			got := splitTranslationSentences(tc.text, language)
			if !reflect.DeepEqual(got, tc.want) || !subtitleSegmentsPreserveText(tc.text, got) {
				t.Fatalf("分句=%q，期望=%q", got, tc.want)
			}
			for _, sentence := range got {
				if repeated := splitTranslationSentences(sentence, language); !reflect.DeepEqual(repeated, []string{sentence}) {
					t.Fatalf("重复分句改变边界: %q -> %q", sentence, repeated)
				}
			}
		})
	}
}

func TestTranslationSentenceBudgetPrefersClauses(t *testing.T) {
	for _, tc := range []struct {
		name, language, left, right string
	}{
		{"英文逗号", "en", strings.Repeat("a useful phrase ", 40) + ",", strings.Repeat(" another phrase", 20)},
		{"德语连接词", "de", strings.Repeat("ein langes Wort ", 40), "weil " + strings.Repeat("wir weiter sprechen ", 20)},
		{"日语标点", "ja", strings.Repeat("今日は忙しい", 30) + "、", strings.Repeat("明日は出発します", 20)},
		{"阿拉伯语标点", "ar", strings.Repeat("نحن نتحدث ", 35) + "،", strings.Repeat(" ثم نعمل", 30)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			text := tc.left + tc.right
			parts, err := splitTranslationSentenceForBudget(text, 800, types.StandardLanguageCode(tc.language))
			if err != nil || len(parts) < 2 || parts[0] != strings.TrimSpace(tc.left) || !validTranslationSentenceParts(text, parts, types.StandardLanguageCode(tc.language)) {
				t.Fatalf("从句切分=%q，错误=%v", parts, err)
			}
		})
	}
}

func TestTranslationSentenceBudgetProtectsLanguageUnits(t *testing.T) {
	for _, tc := range []struct{ language, unit string }{
		{"de", "3. Oktober"}, {"de", "z. B. Berlin"}, {"fr", "Mme. Dupont"},
		{"ru", "Проф. Иванов"}, {"hi", "डॉ. शर्मा"}, {"en", "D. C."},
		{"en", "https://example.com/a,b:c"}, {"en", "3,14159"},
		{"en", "10 km"}, {"ru", "10 км"}, {"zh_cn", "10公里"}, {"en", "10:30"},
	} {
		t.Run(tc.unit, func(t *testing.T) {
			text := strings.Repeat("word ", 158) + tc.unit + " continues."
			parts, err := splitTranslationSentenceForBudget(text, 800, types.StandardLanguageCode(tc.language))
			if err != nil || !validTranslationSentenceParts(text, parts, types.StandardLanguageCode(tc.language)) {
				t.Fatalf("预算分句=%q，错误=%v", parts, err)
			}
			found := false
			for _, part := range parts {
				found = found || strings.Contains(part, tc.unit)
			}
			if !found {
				t.Fatalf("切开了 %q: %q", tc.unit, parts)
			}
		})
	}
}

func TestTranslationSentenceBudgetUnicodeAndCoverage(t *testing.T) {
	for _, sample := range []string{"क्षि ", "العَرَبِيَّة ", "ภาษาไทย", "漢字", "👨‍👩‍👧‍👦 café ", "word ", "word,\u0301 "} {
		text := strings.Repeat(sample, 200) + "."
		parts, err := splitTranslationSentenceForBudget(text, 800, "unknown")
		if err != nil || len(parts) < 2 || !subtitleSegmentsHaveSafeBoundaries(parts) || !subtitleSegmentsPreserveText(text, parts) {
			t.Fatalf("Unicode 分段: %q error=%v", sample, err)
		}
		for _, part := range parts {
			if len(part) > 800 || !hasSubtitleContent(part) {
				t.Fatalf("非法片段: %q", part)
			}
		}
	}
}

func TestTranslationSentenceSemanticRefinement(t *testing.T) {
	left := strings.Repeat("a long original phrase ", 25)
	right := strings.Repeat("another original phrase ", 20)
	text := left + right
	want := []string{strings.TrimSpace(left), strings.TrimSpace(right)}
	baseline, err := splitTranslationSentenceForBudget(text, 800, "en")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name     string
		response any
		want     []string
	}{
		{"自然边界", map[string]any{"segments": want}, want},
		{"改写原文回退", map[string]any{"segments": []string{"changed", right}}, baseline},
		{"重复回退", map[string]any{"segments": []string{left, left, right}}, baseline},
		{"超预算回退", map[string]any{"segments": []string{text, "extra"}}, baseline},
		{"词内切分回退", map[string]any{"segments": []string{text[:3], text[3:]}}, baseline},
		{"错误结构回退", map[string]any{"other": want}, baseline},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
				calls++
				if !strings.Contains(prompt, `"source_language":"en"`) {
					t.Fatal("语义切分缺少源语言")
				}
				data, err := json.Marshal(tc.response)
				return string(data), err
			})}
			for range 2 {
				got, err := translator.prepareTranslationSentences(context.Background(), []string{text}, "en")
				if err != nil || !reflect.DeepEqual(got, tc.want) {
					t.Fatalf("语义切分=%q，期望=%q，错误=%v", got, tc.want, err)
				}
			}
			if calls != 1 {
				t.Fatalf("恢复时重复调用预分句模型: %d", calls)
			}
		})
	}
}

func TestTranslationSentenceSemanticFailureAndCancellation(t *testing.T) {
	text := strings.Repeat("a long original phrase ", 45)
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) { return "", errors.New("unavailable") })}
	got, err := translator.prepareTranslationSentences(context.Background(), []string{text}, "en")
	if err != nil || len(got) < 2 || !subtitleSegmentsPreserveText(text, got) {
		t.Fatalf("预分句服务失败丢失原文: %q error=%v", got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	translator.chatCompleter = translationCompleterFunc(func(string) (string, error) { cancel(); return "", nil })
	_, err = translator.prepareTranslationSentences(ctx, []string{text}, "en")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("取消未传播: %v", err)
	}
}

func TestTranslationSentenceSemanticOnlyForUncertainLongInput(t *testing.T) {
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		t.Fatal("确定的句界或超大输入不应额外请求模型")
		return "", nil
	})}
	for _, text := range []string{
		"Mme. Dupont arrive. Elle repart demain.",
		strings.Repeat(strings.Repeat("une phrase ", 50)+", ", 2),
		strings.Repeat("une phrase ", 400),
	} {
		parts, err := translator.prepareTranslationSentences(context.Background(), []string{text}, "fr")
		if err != nil || !subtitleSegmentsPreserveText(text, parts) {
			t.Fatalf("预分句丢失原文: %q error=%v", parts, err)
		}
	}
}

func TestTranslationSentenceSemanticRejectsBrokenProtectedUnits(t *testing.T) {
	for _, tc := range []struct{ language, unit string }{
		{"fr", "Mme. Dupont"}, {"de", "3. Oktober"}, {"en", "10 km"},
	} {
		left := strings.Repeat("word ", 100)
		right := strings.Repeat(" word", 100)
		text := left + tc.unit + right
		cut := len(left) + strings.Index(tc.unit, " ")
		if validTranslationSentenceParts(text, []string{text[:cut], text[cut:]}, types.StandardLanguageCode(tc.language)) {
			t.Fatalf("接受了切开 %q 的模型建议", tc.unit)
		}
	}
}

func TestTranslationSentencePreprocessingRoutes(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.MaxSentenceLength = 70
	for _, route := range []string{"direct", "transcription", "subtitle"} {
		t.Run(route, func(t *testing.T) {
			var got []string
			completer := translationCompleterFunc(func(prompt string) (string, error) {
				input, err := decodePairedTestInput(prompt)
				if err != nil {
					return "", err
				}
				for _, sentence := range input.Sentences {
					got = append(got, sentence.Text)
				}
				return echoPairedTestResponse(input)
			})
			text := "Am 3. Oktober treffen wir uns. Danach gehen wir."
			var err error
			switch route {
			case "direct":
				_, err = (&Translator{chatCompleter: completer}).SplitTextAndTranslate(text, "de", "zh_cn")
			case "transcription":
				_, err = (Service{ChatCompleter: completer}).splitTextAndTranslateRecoverable(context.Background(), "", text, "de", "zh_cn", false, 0, nil, nil)
			case "subtitle":
				source := []*util.SrtBlock{
					{Index: 1, Timestamp: "00:00:01,000 --> 00:00:02,000", OriginLanguageSentence: "Am 3."},
					{Index: 2, Timestamp: "00:00:02,000 --> 00:00:04,000", OriginLanguageSentence: "Oktober treffen wir uns. Danach gehen wir."},
				}
				var output []*util.SrtBlock
				output, err = (&Translator{chatCompleter: completer}).BatchTranslateSrtBlocks(context.Background(), source, "de", "zh_cn", nil)
				if err == nil {
					assertPairedOutput(t, source, output, 70)
				}
			}
			want := []string{"Am 3. Oktober treffen wir uns.", "Danach gehen wir."}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("入口=%s 分句=%q 错误=%v", route, got, err)
			}
		})
	}
}
