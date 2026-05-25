# Career Portal Navigation Context

## [target-org] Careers
- URL: `kpmg.com/ca/en/home/careers.html` or `careers.kpmg.ca`
- Job search: use search bar or browse by category
- Application flow: typically redirects to an ATS (Workday, Taleo, or custom)
- Common fields: name, email, phone, resume upload, cover letter, LinkedIn URL
- Resume format: PDF preferred
- May require account creation before applying

## Greenhouse (Common ATS)
- URL pattern: `boards.greenhouse.io/{company}/jobs/{job_id}`
- Application page: click "Apply for this job"
- Standard fields:
  - First name, Last name
  - Email, Phone
  - Resume (file upload — PDF)
  - Cover letter (file upload or text field)
  - LinkedIn URL
  - How did you hear about this job?
  - Work authorization
  - Custom questions (varies by company)
- Submit button at bottom of form
- Confirmation page after submission

## Lever (Common ATS)
- URL pattern: `jobs.lever.co/{company}/{job_id}`
- Application: click "Apply for this job"
- Standard fields similar to Greenhouse
- Often has fewer custom fields
- Resume parsing may auto-fill some fields

## General Form-Fill Strategy
1. Navigate to the application URL
2. Wait for form to fully load
3. Fill fields in order:
   - Personal info (from config/profile.yml)
   - Resume upload (from output/ directory — must generate PDF first)
   - Cover letter (from cover-letter.md content or PDF)
   - LinkedIn URL
   - Custom questions (use cv.md and cover-letter.md for context)
4. **SCREENSHOT before submitting** — always
5. **Wait for human confirmation** before clicking submit
6. After submission, screenshot the confirmation page

## Common Failures
- **Account required**: Some portals need account creation first → flag to user
- **File upload issues**: Ensure PDF is under size limit (usually 5MB)
- **Required fields missed**: Check for validation errors after fill
- **Session timeout**: Long forms may time out → fill quickly
- **CAPTCHA**: Some portals have CAPTCHA → ask user to solve
- **Duplicate application**: Portal may flag if already applied → check and flag
