from pathlib import Path
from PIL import Image, ImageOps
import re

ext = {
    1:'png', 2:'png', 3:'png', 4:'jpeg', 5:'png', 6:'png',
    7:'png', 8:'jpeg', 9:'png', 10:'png', 11:'png', 12:'jpeg',
    13:'png', 14:'png', 15:'png', 16:'jpeg', 17:'png', 18:'png',
}
out_dir = Path('public/step3-optimized')
out_dir.mkdir(parents=True, exist_ok=True)
for i in range(1, 19):
    src = Path(f'public/step3/post-{i:02d}.{ext[i]}')
    if not src.exists():
        raise SystemExit(f'Missing source image: {src}')
    with Image.open(src) as opened:
        img = ImageOps.exif_transpose(opened).convert('RGB')
        if img.width > 600:
            height = max(1, round(img.height * (600 / img.width)))
            img = img.resize((600, height), Image.Resampling.LANCZOS)
        img.save(out_dir / f'post-{i:02d}.webp', 'WEBP', quality=80, method=6, optimize=True)

path = Path('src/App.jsx')
text = path.read_text(encoding='utf-8')

text = text.replace("import { recognizeMobileId } from './ocr';\n", '', 1)
text, count = re.subn(r"\nfunction MobileId\([\s\S]*?\nfunction ReviewField\(", "\nfunction ReviewField(", text, count=1)
if count != 1:
    raise SystemExit(f'Could not remove obsolete MobileId component; matches={count}')

text, count = re.subn(
    r"\n  const \[isReading, setIsReading\] = useState\(false\);\n  const \[progress, setProgress\] = useState\(0\);\n  const \[ocrError, setOcrError\] = useState\(''\);",
    '', text, count=1,
)
if count != 1:
    raise SystemExit(f'Could not remove obsolete OCR states; matches={count}')

text, count = re.subn(
    r"\n  const handleSelected = async \(file\) => \{[\s\S]*?\n  \};\n\n  const moveAfterDelay",
    "\n\n  const moveAfterDelay", text, count=1,
)
if count != 1:
    raise SystemExit(f'Could not remove obsolete OCR handler; matches={count}')

marker = "const COMPLETED_KEY = 'moca-survey-completed-v1';\n"
if marker not in text:
    raise SystemExit('Could not find storage constants')
text = text.replace(marker, marker + "const SESSION_TTL_MS = 12 * 60 * 60 * 1000;\n", 1)

initial_pattern = r"  const initialState = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[\]\);\n  const initialSession"
initial_replacement = """  const initialState = useMemo(() => {
    const storedSession = loadSession();
    const storedAuth = loadAuth();
    const updatedAt = Number(storedSession?.updatedAt || 0);
    const isFreshSession = Boolean(updatedAt && Date.now() - updatedAt >= 0 && Date.now() - updatedAt < SESSION_TTL_MS);
    const verified = storedSession?.verifiedUser || storedAuth || null;
    const restorablePages = new Set([
      'part1', 'part2', 'compare', 'finalTie',
      'step3Loading', 'step3Rank', 'step3Modal', 'step3Compare',
      'resultLoading', 'result', 'already', 'offlineGuide',
    ]);

    if (isFreshSession && verified?.studentId && restorablePages.has(storedSession?.page)) {
      let restoredPage = storedSession.page;
      const needsResult = ['step3Loading', 'step3Rank', 'step3Modal', 'step3Compare', 'resultLoading', 'result', 'offlineGuide'];
      if (needsResult.includes(restoredPage) && !storedSession.result) restoredPage = 'part2';
      if (restoredPage === 'already' && !storedSession.existingRecord?.result) restoredPage = storedSession.result ? 'result' : 'part1';
      return { session: storedSession, auth: verified, completed: storedSession.existingRecord || null, restoredPage };
    }

    if (isSupabaseConfigured) {
      return { session: null, auth: null, completed: null, restoredPage: 'start' };
    }

    const session = isFreshSession ? storedSession : null;
    const auth = session?.verifiedUser || storedAuth || null;
    const completed = auth?.studentId ? getCompletedRecord(auth.studentId) : null;
    let restoredPage = session?.page || 'start';
    if (completed?.result && (!session || restoredPage === 'start' || restoredPage === 'upload' || restoredPage === 'review')) restoredPage = 'already';
    else if (auth && (!session || restoredPage === 'start' || restoredPage === 'upload' || restoredPage === 'review')) restoredPage = 'part1';
    return { session, auth, completed, restoredPage };
  }, []);
  const initialSession"""
text, count = re.subn(initial_pattern, initial_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'Could not replace initial recovery state; matches={count}')

old_effect = """  useEffect(() => {
    const safePage = page === 'upload' && isReading ? 'upload' : page;
    writeJson(SESSION_KEY, {
      page: safePage, ocrData, verifiedUser, part1Index, part2Index, part1Answers, part2Answers,
      comparison, compareIndex, compareAnswers, finalTieAnswer, step3Rankings, step3CompareIndex, step3StructureChoices, result, existingRecord,
    });
  }, [page, ocrData, verifiedUser, part1Index, part2Index, part1Answers, part2Answers, comparison, compareIndex, compareAnswers, finalTieAnswer, step3Rankings, step3CompareIndex, step3StructureChoices, result, existingRecord, isReading]);"""
new_effect = """  useEffect(() => {
    writeJson(SESSION_KEY, {
      page, ocrData, verifiedUser, part1Index, part2Index, part1Answers, part2Answers,
      comparison, compareIndex, compareAnswers, finalTieAnswer, step3Rankings, step3CompareIndex, step3StructureChoices, result, existingRecord,
      updatedAt: Date.now(),
    });
  }, [page, ocrData, verifiedUser, part1Index, part2Index, part1Answers, part2Answers, comparison, compareIndex, compareAnswers, finalTieAnswer, step3Rankings, step3CompareIndex, step3StructureChoices, result, existingRecord]);"""
if old_effect not in text:
    raise SystemExit('Could not find session persistence effect')
text = text.replace(old_effect, new_effect, 1)

scores_marker = "  const scores = useMemo(() => calculateScores(part2Answers), [part2Answers]);\n"
checkpoint = """

  const persistRecoveryCheckpoint = (nextPage, overrides = {}) => {
    writeJson(SESSION_KEY, {
      page: nextPage,
      ocrData,
      verifiedUser,
      part1Index,
      part2Index,
      part1Answers,
      part2Answers,
      comparison,
      compareIndex,
      compareAnswers,
      finalTieAnswer,
      step3Rankings,
      step3CompareIndex,
      step3StructureChoices,
      result,
      existingRecord,
      updatedAt: Date.now(),
      ...overrides,
    });
  };
"""
if scores_marker not in text:
    raise SystemExit('Could not find scores marker')
text = text.replace(scores_marker, scores_marker + checkpoint, 1)

old_last = """    } else {
      setPage('resultLoading');
      window.scrollTo({ top: 0 });
    }
  };"""
new_last = """    } else {
      persistRecoveryCheckpoint('resultLoading', { step3StructureChoices: next });
      setPage('resultLoading');
      window.scrollTo({ top: 0 });
    }
  };"""
if old_last not in text:
    raise SystemExit('Could not find final Step3 transition')
text = text.replace(old_last, new_last, 1)

for i in range(1, 19):
    pid = f'P3-{i:02d}'
    line_pattern = rf"(\{{ id: '{pid}', group: 'V\d', )image: '[^']+', fallback: '[^']+'"
    replacement = rf"\1image: '/step3-optimized/post-{i:02d}.webp', fallback: '/step3/post-{i:02d}.{ext[i]}'"
    text, n = re.subn(line_pattern, replacement, text, count=1)
    if n != 1:
        raise SystemExit(f'Could not patch image source for {pid}; matches={n}')

text = text.replace(
    '<img src={post.image} alt={post.alt} onError=',
    '<img src={post.image} alt={post.alt} loading="lazy" decoding="async" onError='
)
text = text.replace(
    '<img src={post.image} alt="" onError=',
    '<img src={post.image} alt="" loading="lazy" decoding="async" onError='
)
text = text.replace("[...visiblePosts, ...STEP3_POSTS].slice(0, 10)", "[...visiblePosts, ...STEP3_POSTS].slice(0, 6)", 1)

old_result_head = """function ResultScreen({ result, scores, onRestart, onOfflineGuide }) {
  const actualPrimary = TYPE_META[result.primaryType];
  const actualSecondary = TYPE_META[result.secondaryType];
  const [browseType, setBrowseType] = useState('');
  const [saving, setSaving] = useState(false);
  const displayType = browseType || result.primaryType;
  const isOwnResult = displayType === result.primaryType;
  const displayPrimary = TYPE_META[displayType];
  const displayMeta = RESULT_META[displayType];
  const accent = TYPE_COLORS[displayType];"""
new_result_head = """function ResultScreen({ result, scores, onRestart, onOfflineGuide }) {
  const safePrimaryType = TYPE_META[result?.primaryType] && RESULT_META[result?.primaryType] ? result.primaryType : 'archive';
  const safeSecondaryType = TYPE_META[result?.secondaryType]
    ? result.secondaryType
    : (TYPE_ORDER.find((type) => type !== safePrimaryType) || 'expert');
  const actualPrimary = TYPE_META[safePrimaryType];
  const actualSecondary = TYPE_META[safeSecondaryType];
  const [browseType, setBrowseType] = useState('');
  const [saving, setSaving] = useState(false);
  const displayType = (browseType && TYPE_META[browseType] && RESULT_META[browseType]) ? browseType : safePrimaryType;
  const isOwnResult = displayType === safePrimaryType;
  const displayPrimary = TYPE_META[displayType];
  const displayMeta = RESULT_META[displayType];
  const accent = TYPE_COLORS[displayType] || TYPE_COLORS.archive;"""
if old_result_head not in text:
    raise SystemExit('Could not find ResultScreen head')
text = text.replace(old_result_head, new_result_head, 1)
text = text.replace(
    "const otherTypes = TYPE_ORDER.filter((type) => type !== result.primaryType);",
    "const otherTypes = TYPE_ORDER.filter((type) => type !== safePrimaryType);", 1,
)
text = text.replace(
    "saveShareCard(actualPrimary, RESULT_META[result.primaryType], topThree, TYPE_COLORS[result.primaryType])",
    "saveShareCard(actualPrimary, RESULT_META[safePrimaryType], topThree, TYPE_COLORS[safePrimaryType])", 1,
)
text = text.replace(
    "<b>{RESULT_META[result.primaryType].secondaryCopy}</b>",
    "<b>{RESULT_META[safePrimaryType].secondaryCopy}</b>", 1,
)

path.write_text(text, encoding='utf-8')
