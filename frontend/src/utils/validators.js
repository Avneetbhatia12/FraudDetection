export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isRequired = (value) => value !== null && value !== undefined && String(value).trim() !== '';

export const isPositiveNumber = (value) => !isNaN(value) && parseFloat(value) > 0;

export const validatePatient = (data) => {
  const errors = {};
  if (!isRequired(data.FIRST_NAME)) errors.FIRST_NAME = 'First name is required';
  if (!isRequired(data.LAST_NAME))  errors.LAST_NAME  = 'Last name is required';
  if (!isRequired(data.GENDER))     errors.GENDER     = 'Gender is required';
  if (!isRequired(data.DOB))        errors.DOB        = 'Date of birth is required';
  if (!isRequired(data.ADDRESS))    errors.ADDRESS    = 'Address is required';
  if (!isRequired(data.EMAIL))      errors.EMAIL      = 'Email is required';
  else if (!isValidEmail(data.EMAIL)) errors.EMAIL    = 'Invalid email format';
  return errors;
};

export const validateClaim = (data) => {
  const errors = {};
  if (!isRequired(data.CLAIM_DATE))   errors.CLAIM_DATE   = 'Claim date is required';
  if (!isPositiveNumber(data.CLAIM_AMOUNT)) errors.CLAIM_AMOUNT = 'Valid claim amount is required';
  if (!isRequired(data.DIAGNOSIS))    errors.DIAGNOSIS    = 'Diagnosis is required';
  if (!isRequired(data.POLICY_ID))    errors.POLICY_ID    = 'Policy is required';
  if (!isRequired(data.PROVIDER_ID))  errors.PROVIDER_ID  = 'Provider is required';
  return errors;
};
