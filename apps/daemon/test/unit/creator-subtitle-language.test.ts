import { describe, expect, it } from 'vitest';
import { detectSubtitleLanguage } from '../../src/creator/subtitle-language.js';

describe('source subtitle language detection', () => {
  it.each([
    ['hi', 'यह वीडियो 11Reader के साथ साझेदारी में बनाया गया है, और आगे मैं आपको इनके बारे में और बताऊंगा। तो, एक पूर्णकालिक डॉक्टर, यूट्यूबर और उत्पादकता कोच के तौर पर, मेरी असली मुश्किलों में से एक है पढ़ने के लिए समय निकालना।'],
    ['en', 'This video is made in partnership with 11Reader, and I will tell you more about them as we go. As a full-time medical doctor, YouTuber, and productivity coach, finding time to read has been difficult.'],
    ['es', 'Este vídeo se ha realizado en colaboración con 11Reader, y te contaré más sobre ellos a lo largo del vídeo. Como médico a tiempo completo, una de las cosas que de verdad me ha costado es encontrar tiempo para leer.'],
    ['nn', 'Eg likar å lesa bøker når eg reiser med toget til arbeid. Denne filmen handlar om korleis vi kan finna meir tid til læring i ein travel kvardag. Du kan høyra på lydbøker medan du går tur, lagar mat eller ryddar heime. På den måten får eg lese mykje meir enn før, sjølv om eg har mange oppgåver kvar dag.'],
    ['ja', 'この動画は11Readerとの提携で制作しています。動画の中で詳しくご紹介します。私は医師として働きながら、動画の制作や仕事をしているため、読書の時間を確保するのがとても難しいと感じています。'],
    ['ko', '이 영상은 11Reader와 협업하여 제작되었습니다. 영상에서 자세히 소개해 드리겠습니다. 저는 의사로 일하면서 유튜브 영상을 만들고 있기 때문에 책을 읽을 시간을 내기가 정말 어렵다고 느꼈습니다.'],
    ['ar', 'تم إعداد هذا الفيديو بالتعاون مع تطبيق القراءة، وسأخبركم بالمزيد عنه خلال الفيديو. بصفتي طبيبًا بدوام كامل وصانع محتوى، فإن أحد الأمور التي واجهت صعوبة حقيقية فيها هو إيجاد الوقت للقراءة.'],
    ['zh_cn', '这个视频由我们与阅读应用合作制作，接下来我会进一步介绍它。作为一名全职医生和视频创作者，我一直面临的一个实际困难，就是没有足够的时间阅读。现在我可以在通勤和锻炼的时候听书了。'],
    ['zh_tw', '這個影片由我們與閱讀應用程式合作製作，接下來我會進一步介紹它。作為一名全職醫生和影片創作者，我一直面臨的一個實際困難，就是沒有足夠的時間閱讀。現在我可以在通勤和鍛鍊的時候聽書了。']
  ])('detects %s from caption text', (language, text) => {
    expect(detectSubtitleLanguage([{ text }])).toBe(language);
  });

  it('ignores subtitle styling and keeps insufficient text unresolved', () => {
    expect(detectSubtitleLanguage([{ text: '<font face="English Arial">Hello</font> {\\an8}11Reader 1234567890' }])).toBeUndefined();
    expect(detectSubtitleLanguage([{ text: '1234567890 '.repeat(20) }])).toBeUndefined();
  });

  it('does not assign one language to conflicting full-length samples', () => {
    const english = 'This is an English reading lesson about finding more time to read books during the daily commute. '.repeat(35);
    const hindi = 'यह वीडियो पढ़ने के लिए समय निकालने के बारे में है। मैं हर दिन काम पर जाते समय किताबें सुनता हूं। '.repeat(35);
    expect(detectSubtitleLanguage([{ text: english }, { text: hindi }])).toBeUndefined();
  });
});
