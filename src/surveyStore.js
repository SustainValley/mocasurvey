import { ensureAnonymousSession, isSupabaseConfigured, supabase } from './supabase';

export async function claimStudentSurvey(verifiedUser) {
  if (!isSupabaseConfigured) return { mode: 'local' };
  await ensureAnonymousSession();

  const { data, error } = await supabase.rpc('claim_moca_survey', {
    p_student_id: String(verifiedUser.studentId).trim(),
    p_name: String(verifiedUser.name || '').trim(),
    p_department: String(verifiedUser.department || '').trim(),
  });
  if (error) throw error;
  const payload = Array.isArray(data) ? data[0] : data;
  return payload || { status: 'claimed' };
}

export async function saveSurveyProgress({ verifiedUser, page, part1Answers, part2Answers, comparison, compareAnswers }) {
  if (!isSupabaseConfigured || !verifiedUser?.studentId) return;
  const { user } = await ensureAnonymousSession();
  if (!user) return;

  const { error } = await supabase.from('moca_survey_drafts').upsert({
    owner_id: user.id,
    student_id: String(verifiedUser.studentId),
    verified_user: verifiedUser,
    current_page: page,
    part1_answers: part1Answers,
    part2_answers: part2Answers,
    comparison_state: comparison,
    compare_answers: compareAnswers,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' });
  if (error) throw error;
}

export async function completeStudentSurvey({ verifiedUser, result, part1Answers, part2Answers, step3Rankings = [], step3StructureChoices = {}, scores }) {
  if (!isSupabaseConfigured) return { mode: 'local' };
  await ensureAnonymousSession();

  const responses = [];
  for (const answer of part1Answers || []) {
    if (!answer) continue;
    responses.push({
      part: 1,
      question_id: answer.questionId,
      behavior_stage: null,
      selected_option: answer.optionKey,
      selected_text: answer.optionText,
      linked_type: null,
      option_position: Number(answer.optionKey) + 1,
      response_time_ms: answer.responseTimeMs || 0,
      was_modified: Boolean(answer.modified),
    });
  }
  for (const answer of part2Answers || []) {
    if (!answer) continue;
    responses.push({
      part: 2,
      question_id: answer.questionId,
      behavior_stage: answer.behaviorStage || null,
      selected_option: answer.optionKey,
      selected_text: answer.optionText,
      linked_type: answer.linkedType || null,
      option_position: answer.optionPosition || null,
      response_time_ms: answer.responseTimeMs || 0,
      was_modified: Boolean(answer.modified),
    });
  }


  for (let index = 0; index < (step3Rankings || []).length; index += 1) {
    const postId = step3Rankings[index];
    const numeric = Number(String(postId).split('-').pop()) || null;
    const group = numeric ? `V${Math.ceil(numeric / 3)}` : null;
    responses.push({
      part: 3,
      question_id: `P3_RANK_${index + 1}`,
      behavior_stage: 'overall_post_ranking',
      selected_option: postId,
      selected_text: `TOP ${index + 1}`,
      linked_type: group,
      option_position: index + 1,
      response_time_ms: 0,
      was_modified: false,
    });
  }

  for (const groupId of ['V1', 'V2', 'V3']) {
    const postId = step3StructureChoices?.[groupId];
    if (!postId) continue;
    const numeric = Number(String(postId).split('-').pop()) || 0;
    const positionInGroup = numeric ? ((numeric - 1) % 3) + 1 : null;
    responses.push({
      part: 3,
      question_id: `P3_STRUCTURE_${groupId}`,
      behavior_stage: 'structure_preference',
      selected_option: postId,
      selected_text: `${groupId} structure choice`,
      linked_type: groupId,
      option_position: positionInGroup,
      response_time_ms: 0,
      was_modified: false,
    });
  }

  const { data, error } = await supabase.rpc('complete_moca_survey', {
    p_student_id: String(verifiedUser.studentId).trim(),
    p_result: result,
    p_scores: scores,
    p_part1_answers: part1Answers,
    p_part2_answers: part2Answers,
    p_responses: responses,
  });
  if (error) throw error;
  const payload = Array.isArray(data) ? data[0] : data;
  return payload || { status: 'completed' };
}

export async function markOfflineParticipation(studentId) {
  if (!isSupabaseConfigured) return { mode: 'local' };
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('mark_moca_offline_participation', {
    p_student_id: String(studentId).trim(),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
