import type { CreatorLocalComponent } from '@opencreator/protocol';
import type { LocalizeCopy } from '../../i18n/localized-copy.js';

export function localComponentPreparationMessage(state: CreatorLocalComponent['state'], localize: LocalizeCopy): string {
  if (state === 'verifying') return localize(
    '正在检查和校验本地转录组件。当前尚未开始转录；检查完成后会自动继续。',
    'Checking and verifying local transcription components. Transcription has not started; the task continues automatically after verification.',
    'Kontrollerar och verifierar lokala transkriptionskomponenter. Transkriptionen har inte startat; uppgiften fortsätter automatiskt efter verifieringen.'
  );
  if (state === 'extracting') return localize(
    '正在解压安装本地转录组件。当前尚未开始转录；安装完成后会自动继续。',
    'Extracting and installing local transcription components. Transcription has not started; the task continues automatically after installation.',
    'Packar upp och installerar lokala transkriptionskomponenter. Transkriptionen har inte startat; uppgiften fortsätter automatiskt efter installationen.'
  );
  return localize(
    '正在准备本地转录组件。模型文件较大，可能需要较长时间；下载并校验完成后会自动继续，无需重新开始任务。',
    'Preparing local transcription components. Models are large and may take time to download; the task continues automatically after download and verification, without restarting.',
    'Förbereder lokala transkriptionskomponenter. Modellerna är stora och kan ta tid att ladda ned; uppgiften fortsätter automatiskt efter nedladdning och verifiering utan att startas om.'
  );
}
