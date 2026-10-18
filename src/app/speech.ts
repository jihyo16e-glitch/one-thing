// Speech to text. No AI API, no key, no LLM: the words go to the fixed rules in domain/commands.ts.
// - Web (Chrome): the browser's Web Speech API = Google's speech service, needs internet.
// - APK (Capacitor, 2026-10-18): Android's own SpeechRecognizer through @capgo/capacitor-speech-recognition
//   (the phone's recognizer; Google's works offline by itself when the English pack is on the phone).
//   Android WebView turns the Web Speech API off, so the APK must use the plugin.
// The app never stores audio.
import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { isNative } from './native';

interface Alternative { transcript: string }
interface Result { isFinal: boolean; 0: Alternative; length: number }
interface ResultEvent { resultIndex: number; results: { length: number; [i: number]: Result } }
interface ErrorEvent { error: string }
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The commands are English: use the phone's English (en-PH, en-US …), else US English. */
function language(): string {
  const lang = navigator.language || 'en-US';
  return /^en\b/i.test(lang) ? lang : 'en-US';
}

export function speechSupported(): boolean {
  return isNative() || recognitionClass() !== null;
}

/** The web mic always needs internet; the APK may work offline (on-device recognizer). */
export function speechNeedsInternet(): boolean {
  return !isNative();
}

/** What to tell the user for each error. `null` = say nothing (the user stopped). */
export function speechErrorText(code: string): string | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'no-speech':
      return 'I did not hear anything. Tap the mic and try again.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked for One Thing. Allow it in the phone settings (App info, Permissions, Microphone), then try again. You can also type.';
    case 'network':
      return 'Speaking needs internet on this phone right now. Type it instead: typed commands work offline.';
    case 'audio-capture':
      return 'I cannot find a microphone. Type it instead.';
    case 'not-supported':
      return 'This phone has no speech service. Type it instead.';
    case 'language':
      return 'The offline English speech pack is not on this phone, and there is no internet. Type it instead.';
    default:
      return 'Speech did not work this time. Type it instead.';
  }
}

export interface ListenHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
  onEnd: () => void;
}

/** Listens for one sentence. Returns a stop function (stop = use what was heard so far). */
export function listen(h: ListenHandlers): () => void {
  return isNative() ? listenNative(h) : listenWeb(h);
}

function listenWeb(h: ListenHandlers): () => void {
  const Rec = recognitionClass();
  if (!Rec) {
    h.onError('not-supported');
    h.onEnd();
    return () => undefined;
  }
  const rec = new Rec();
  rec.lang = language();
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalSent = false;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    if (final && !finalSent) {
      finalSent = true;
      h.onFinal(text.trim());
    } else if (!final) {
      h.onInterim(text.trim());
    }
  };
  rec.onerror = (e) => h.onError(e.error);
  rec.onend = () => h.onEnd();
  try {
    rec.start();
  } catch {
    h.onError('start-failed');
    h.onEnd();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

/** Android recognizer error names -> the web error names speechErrorText() knows. */
function nativeCode(raw: unknown): string {
  const c = String(raw ?? '').toUpperCase();
  if (/PERMISSION|NOT_ALLOWED|DENIED/.test(c)) return 'not-allowed';
  if (/NO_MATCH|SPEECH_TIMEOUT|NO_SPEECH/.test(c)) return 'no-speech';
  if (/LANGUAGE/.test(c)) return 'language';
  if (/NETWORK|SERVER/.test(c)) return 'network';
  if (/AUDIO/.test(c)) return 'audio-capture';
  if (/CANCEL|ABORT|BUSY/.test(c)) return 'aborted';
  return 'other';
}

// Never call SpeechRecognition.isOnDeviceRecognitionAvailable() (plugin 8.3.2): on Android 13+ it runs
// SpeechRecognizer.checkRecognitionSupport() off the main thread, Android throws, and Capacitor turns
// that into an app crash (2026-10-18, first phone test on an Infinix: tap the mic -> the app closed). The normal
// recognizer below runs on the main thread, and Google's recognizer still works offline by itself when
// the phone has the English pack.
function listenNative(h: ListenHandlers): () => void {
  const handles: PluginListenerHandle[] = [];
  let heard = '';
  let error = '';
  let stopped = false;
  let done = false;
  const lang = language();

  const cleanUp = () => {
    for (const x of handles) x.remove().catch(() => undefined);
  };
  const end = (text: string, code: string) => {
    if (done) return;
    done = true;
    cleanUp();
    if (text) h.onFinal(text);
    else if (code) h.onError(code);
    h.onEnd();
  };
  const start = () =>
    SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: true, popup: false, useOnDeviceRecognition: false });

  (async () => {
    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') return end('', 'not-allowed');
      if (!(await SpeechRecognition.available()).available) return end('', 'not-supported');
      handles.push(
        await SpeechRecognition.addListener('partialResults', (e) => {
          const t = (e.matches?.[0] ?? e.accumulatedText ?? '').trim();
          if (t) {
            heard = t;
            h.onInterim(t);
          }
        }),
      );
      handles.push(await SpeechRecognition.addListener('error', (e) => { error = nativeCode(e.code); }));
      handles.push(
        await SpeechRecognition.addListener('listeningState', (e) => {
          if (e.state !== 'stopped' && e.status !== 'stopped') return;
          if (heard) return end(heard, '');
          SpeechRecognition.getLastPartialResult()
            .then((r) => end(r.available ? r.text.trim() : '', error || 'no-speech'))
            .catch(() => end('', error || 'no-speech'));
        }),
      );
      if (stopped) return end('', 'aborted');
      await start();
    } catch (err) {
      end(heard, nativeCode((err as { code?: string })?.code ?? err));
    }
  })();

  return () => {
    stopped = true;
    SpeechRecognition.stop().catch(() => end(heard, 'aborted'));
  };
}
