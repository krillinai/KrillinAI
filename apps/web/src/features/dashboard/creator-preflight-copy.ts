import type { LocalizeCopy } from '../../i18n/localized-copy.js';

const messages: Record<string, [string, string, string]> = {
  'input-result-version': ['请先选择有效的已保存项目版本，再准备预览视频。', 'Select a valid saved result version before preparing preview media.', 'Välj en giltig sparad resultatversion innan du förbereder förhandsvisningsvideon.'],
  'bilibili-part': ['请检查 B 站链接，并确认要翻译的视频分集后重试。', 'Check the Bilibili URL and confirm the video part before retrying.', 'Kontrollera Bilibili-länken och bekräfta videodelen innan du försöker igen.'],
  'image-provider': ['图像生成尚未就绪，请检查登录、服务配置及 Runtime 工具支持。', 'Image generation is not ready. Check sign-in, service configuration, and Runtime tool support.', 'Bildgenerering är inte redo. Kontrollera inloggningen, tjänsteinställningarna och verktygsstödet i Runtime.'],
  'transcription-capability': ['当前平台不支持所选转录方式，请调整转录设置。', 'The selected transcription method is unavailable on this platform. Change the transcription settings.', 'Den valda transkriptionsmetoden stöds inte på plattformen. Ändra transkriptionsinställningarna.'],
  'transcription-config': ['语音转录配置不完整，请检查转录服务设置。', 'Speech transcription configuration is incomplete. Check the transcription settings.', 'Inställningarna för taltranskription är ofullständiga. Kontrollera transkriptionsinställningarna.'],
  'input-file': ['输入文件尚未就绪，请重新选择并上传文件。', 'The input file is not ready. Select and upload the file again.', 'Indatafilen är inte redo. Välj och ladda upp filen igen.'],
  'executor': ['当前任务执行器不可用，请检查 Runtime 连接和组件状态。', 'The task executor is unavailable. Check the Runtime connection and component status.', 'Uppgiftsköraren är inte tillgänglig. Kontrollera Runtime-anslutningen och komponentstatusen.'],
  'yt-dlp': ['视频下载组件尚未就绪，请前往组件页面检查。', 'The video download component is not ready. Check the component page.', 'Videonedladdningskomponenten är inte redo. Kontrollera komponentsidan.'],
  'krillin-runtime': ['视频处理运行组件尚未就绪，请检查组件和诊断信息。', 'Video processing runtime components are not ready. Check components and diagnostics.', 'Runtime-komponenterna för videobearbetning är inte redo. Kontrollera komponenterna och diagnostiken.']
};

export function creatorPreflightMessage(id: string, localize: LocalizeCopy): string {
  const message = messages[id];
  return message ? localize(...message) : localize(
    '启动条件尚未满足，请检查相关设置或诊断信息后重试。',
    'Startup requirements are not met. Check the relevant settings or diagnostics and retry.',
    'Startkraven är inte uppfyllda. Kontrollera de relevanta inställningarna eller diagnostiken och försök igen.'
  );
}
