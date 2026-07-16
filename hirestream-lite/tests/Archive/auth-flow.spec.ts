import { test, expect } from '@playwright/test';

const testCandidateEmail = `e2e_candidate_${Date.now()}@test.com`;
const testPassword = 'password123';

// Demo accounts seeded in DB
const DEMO_CANDIDATE = { username: 'demo_candidate', password: 'test123' };
const DEMO_EMPLOYER = { username: 'demo_employer', password: 'test123' };

// Helper: login with given credentials
async function login(page: any, username: string, password: string) {
  await page.goto('/auth');
  await page.getByRole('tab', { name: 'Login' }).click();
  const loginPanel = page.getByRole('tabpanel', { name: 'Login' });
  await loginPanel.getByLabel('Username or Email').fill(username);
  await loginPanel.getByLabel('Password').fill(password);
  await loginPanel.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('/', { timeout: 10000 });
}

test.describe.serial('Authentication and User Flow', () => {

  test('1. landing page loads with correct title and hero', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HireStream|HP Overseas Job Portal/);
    await expect(page.getByTestId('hero-title')).toBeVisible();
    await expect(page.getByTestId('button-find-jobs')).toBeVisible();
  });

  test('2. register a new candidate and redirect to dashboard', async ({ page }) => {
    await page.goto('/auth');
    
    // Switch to Register tab
    await page.getByRole('tab', { name: 'Register' }).click();
    
    // Wait for register tabpanel to be active
    const registerPanel = page.getByRole('tabpanel', { name: 'Register' });
    await expect(registerPanel).toBeVisible();

    // Open the role select dropdown (it renders as a button/combobox)
    await registerPanel.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: 'Candidate (Job Seeker)' }).click();

    // Fill details
    await registerPanel.getByLabel('Full Name').fill('E2E Test Candidate');
    await registerPanel.getByLabel('Email Address').fill(testCandidateEmail);
    await registerPanel.getByLabel('Password').fill(testPassword);

    // Submit
    await registerPanel.getByRole('button', { name: 'Register' }).click();

    // Wait for redirect to homepage (the app redirects based on role)
    await page.waitForURL('/', { timeout: 10000 });

    // Verify the candidate dashboard rendered
    await expect(page.getByTestId('stat-applications')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('job-search-title')).toBeVisible();
  });

  test('3. logout and return to landing page', async ({ page }) => {
    await login(page, testCandidateEmail, testPassword);

    // Logout
    await page.getByRole('button', { name: /Logout/i }).click();

    // Should be back on landing page
    await expect(page.getByTestId('button-find-jobs')).toBeVisible({ timeout: 10000 });
  });

  test('4. login with existing credentials', async ({ page }) => {
    await login(page, testCandidateEmail, testPassword);

    // Verify dashboard is shown
    await expect(page.getByTestId('stat-applications')).toBeVisible({ timeout: 10000 });
  });
});

test.describe.serial('Candidate Job Application Flow', () => {

  test('5. demo_candidate sees real jobs from database', async ({ page }) => {
    await login(page, DEMO_CANDIDATE.username, DEMO_CANDIDATE.password);

    // Job Discovery Board should be visible
    await expect(page.getByTestId('job-search-title')).toBeVisible({ timeout: 10000 });

    // Should show real jobs count (we seeded 8)
    await expect(page.getByTestId('job-count')).toBeVisible();
    const jobCountText = await page.getByTestId('job-count').textContent();
    expect(parseInt(jobCountText || '0')).toBeGreaterThanOrEqual(1);
  });

  test('6. demo_candidate applies to a job successfully', async ({ page }) => {
    await login(page, DEMO_CANDIDATE.username, DEMO_CANDIDATE.password);

    // Wait for jobs to load
    await expect(page.getByTestId('job-search-title')).toBeVisible({ timeout: 10000 });
    
    // Check if there's an Apply Now button available (candidate may have already applied to all from previous runs)
    const applyButton = page.locator('[data-testid^="button-apply-"]').first();
    const appliedButton = page.locator('[data-testid^="button-applied-"]').first();
    
    // Either apply to a new job or verify already-applied state
    const hasApplyButton = await applyButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (hasApplyButton) {
      await applyButton.click();
      // Should see success toast or already applied message
      await expect(
        page.getByText('Application Submitted').or(page.getByText('already applied'))
      ).toBeVisible({ timeout: 10000 });
    } else {
      // All jobs already applied — verify applied state is shown
      await expect(appliedButton).toBeVisible({ timeout: 5000 });
    }
  });

  test('7. demo_candidate sees applications in tracker', async ({ page }) => {
    await login(page, DEMO_CANDIDATE.username, DEMO_CANDIDATE.password);

    // Application tracker should show at least 1 application
    await expect(page.getByTestId('applications-title')).toBeVisible({ timeout: 10000 });
    const countText = await page.getByTestId('applications-count').textContent();
    expect(parseInt(countText || '0')).toBeGreaterThanOrEqual(1);
  });
});

test.describe.serial('Employer Dashboard Flow', () => {

  test('8. demo_employer sees real jobs on dashboard', async ({ page }) => {
    await login(page, DEMO_EMPLOYER.username, DEMO_EMPLOYER.password);

    // Should see active jobs title with count
    await expect(page.getByTestId('active-jobs-title')).toBeVisible({ timeout: 10000 });

    // Stats should show real numbers
    await expect(page.getByTestId('stat-active-jobs')).toBeVisible();
  });

  test('9. demo_employer opens job creation form', async ({ page }) => {
    await login(page, DEMO_EMPLOYER.username, DEMO_EMPLOYER.password);

    // Click post job button
    await page.getByTestId('button-post-job').click();

    // The dialog should open with the form
    await expect(page.getByTestId('input-job-title')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('input-job-company')).toBeVisible();
    await expect(page.getByTestId('select-job-country')).toBeVisible();

    // Fill in the form
    await page.getByTestId('input-job-title').fill('E2E Test Job Posting');
    await page.getByTestId('input-job-company').fill('E2E Test Company');
    await page.getByTestId('input-job-location').fill('Test City');
    
    // Select country
    await page.getByTestId('select-job-country').click();
    await page.getByRole('option', { name: 'Canada' }).click();

    await page.getByTestId('input-job-salary').fill('$100,000 CAD');
    await page.getByTestId('input-job-experience').fill('3');
    await page.getByTestId('textarea-job-description').fill('This is an automated E2E test job posting.');

    // Add a skill
    await page.getByTestId('input-job-skill').fill('Playwright');
    await page.getByTestId('button-add-skill').click();

    // Submit the job
    await page.getByTestId('button-submit-job').click();

    // Should see success toast
    await expect(page.getByText('Job Posted Successfully')).toBeVisible({ timeout: 10000 });
  });
});
