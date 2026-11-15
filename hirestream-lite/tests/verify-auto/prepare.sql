-- States the automated checks rely on, applied to the DISPOSABLE copy only.
-- Each block makes one precondition true regardless of what UAT testers did.

-- Never send real email or SMS from the copy: the checks read codes from the database.
update provider_config set enabled = false where id in ('email', 'sms');

-- Jobs open with a deadline; demo quick-login off (production-like sign-in).
update jobs set status = 'active', hiring_deadline = now() + interval '45 days', target_hires = greatest(target_hires, 10);
update system_settings set value = 'false' where key = 'feature.quick_login_enabled';
update system_settings set value = 'true'  where key = 'capability.assisted_callback_enabled';

-- Interviews in the future; offers not expired.
update interviews set scheduled_at = now() + interval '5 days' where scheduled_at < now()
  and application_id in (select id from applications where status = 'interview_scheduled');
update placements set offer_expires_at = now() + interval '7 days' where status = 'offered';

-- One candidate (champa_devi) with a pending reschedule request.
update interviews set candidate_confirmed_status = 'reschedule_requested',
       candidate_proposed_at = scheduled_at + interval '2 days',
       candidate_reschedule_reason = 'Automated check: please move my interview by two days.'
 where application_id in (select a.id from applications a join candidates c on c.id = a.candidate_id
                          join users u on u.id = c.user_id where u.username = 'champa_devi' and a.status = 'interview_scheduled');

-- At least one interview awaiting an outcome (sanjay_chauhan), not yet confirmed.
update interviews set candidate_confirmed_status = null, result = null
 where application_id in (select a.id from applications a join candidates c on c.id = a.candidate_id
                          join users u on u.id = c.user_id where u.username in ('sanjay_chauhan','shalini_rathore') and a.status = 'interview_scheduled');

-- A candidate message waiting for HPSEDC.
insert into support_messages (id, candidate_id, sender_role, sender_user_id, body, read_by_admin, read_by_candidate, created_at)
select substr(md5(random()::text), 1, 21), c.id, 'candidate', u.id,
       'Automated check: where should I get the medical test done?', false, true, now()
  from candidates c join users u on u.id = c.user_id where u.username = 'nirmala_devi';
