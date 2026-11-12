// Display helpers for AI insights. Timestamps from Express are UTC ISO strings ("...Z"); they are shown in IST and the
// original UTC value is kept (e.g. as a tooltip). Calendar dates (YYYY-MM-DD) are shown as-is, without time-zone shifts.

const IST_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

export const formatIST = (utcIso) => {
  if (!utcIso) return '—';
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${IST_FORMAT.format(d)} IST`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatCalendarDate = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (ymd || '—');
};

/** Today's date in IST as YYYY-MM-DD (for date-picker limits only; the server decides the default as-of date). */
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export const shortDigest = (d) => (d ? `${d.slice(0, 10)}…` : '—');

const UNAVAILABLE_REASONS = {
  not_configured: 'The AI service is not configured on the server, so no new assessment can be computed.',
  disabled: 'The AI service is switched off on the server.',
  circuit_open: 'The AI service is temporarily paused after repeated failures. It will be retried automatically shortly.',
  timeout: 'The AI service did not respond in time.',
  network_error: 'The AI service cannot be reached.',
  upstream_error: 'The AI service reported an error.',
  auth_rejected: 'The AI service rejected the server’s credentials.',
  bad_response: 'The AI service returned an unexpected response.',
  model_not_registered: 'The indicator set is not registered.',
  model_not_approved: 'The registered indicator set is not approved for live data.',
  model_version_mismatch: 'The AI service and the model registry disagree on the indicator version.',
};

/**
 * Turn an Axios error from /api/ai into something the UI can show. 401 is handled globally (redirect to login).
 * Returns { kind, title, message, retryAfter, reason, data }.
 */
export const describeAiError = (err) => {
  const res = err && err.response;
  if (!res) {
    return { kind: 'network', title: 'Server unreachable', message: 'The application server could not be reached. Check your connection and try again.' };
  }
  const data = res.data || {};
  const message = typeof data.message === 'string' ? data.message : '';
  switch (res.status) {
    case 400:
    case 422:
      return { kind: 'invalid', title: 'Request not accepted', message: message || 'The request was not valid.', reason: data.reason, data };
    case 403:
      return { kind: 'forbidden', title: 'Not permitted', message: message || 'Your role does not allow this action.', data };
    case 404:
      return { kind: 'not_found', title: 'Not found', message: message || 'The requested item does not exist.', data };
    case 429: {
      const retryAfter = Number(data.retry_after_seconds || res.headers?.['retry-after']) || null;
      return { kind: 'rate_limited', title: 'Too many requests',
        message: `You have made many AI requests in a short time.${retryAfter ? ` Please try again in ${retryAfter} s.` : ' Please wait a moment.'}`,
        retryAfter, data };
    }
    case 503:
      if (data.ai_status === 'busy') return { kind: 'busy', title: 'Busy', message: 'Another assessment of this item is in progress. Please retry.', data };
      return { kind: 'unavailable', title: 'AI assessment unavailable',
        message: `${UNAVAILABLE_REASONS[data.reason] || 'The AI service is currently unavailable.'} The rule-based fraud detection is unaffected.`,
        reason: data.reason, data };
    default:
      return { kind: 'error', title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.', data };
  }
};
