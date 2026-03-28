import { describe, it, expect } from 'bun:test';
import { state, authedFetch } from './helpers';

describe('Full data scrape', () => {
  it('scrapes all categories from fake-mychart', async () => {
    const res = await authedFetch('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ sessionKey: state.sessionKey }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    // All 30 scraper categories should be present
    const expectedCategories = [
      'profile',
      'email',
      'billing',
      'upcomingVisits',
      'pastVisits',
      'labResults',
      'messages',
      'medications',
      'allergies',
      'immunizations',
      'insurance',
      'careTeam',
      'referrals',
      'healthSummary',
      'letters',
      'healthIssues',
      'preventiveCare',
      'medicalHistory',
      'vitals',
      'emergencyContacts',
      'documents',
      'goals',
      'upcomingOrders',
      'questionnaires',
      'careJourneys',
      'activityFeed',
      'educationMaterials',
      'ehiExport',
      'imagingResults',
      'linkedMyChartAccounts',
    ];

    for (const category of expectedCategories) {
      expect(data).toHaveProperty(category);
    }

    // Spot-check profile data (Homer Simpson)
    expect(data.profile).toBeDefined();
    if (data.profile && !data.profile.error) {
      const profileStr = JSON.stringify(data.profile);
      expect(profileStr).toContain('Homer');
    }

    // Spot-check medications
    expect(data.medications).toBeDefined();
    if (data.medications && !data.medications.error) {
      const medsStr = JSON.stringify(data.medications);
      expect(medsStr.length).toBeGreaterThan(10);
    }

    // Spot-check allergies
    expect(data.allergies).toBeDefined();
    if (data.allergies && !data.allergies.error) {
      const allergiesStr = JSON.stringify(data.allergies);
      expect(allergiesStr.length).toBeGreaterThan(10);
    }

    // Spot-check health summary
    expect(data.healthSummary).toBeDefined();
    if (data.healthSummary && !data.healthSummary.error) {
      const summaryStr = JSON.stringify(data.healthSummary);
      expect(summaryStr.length).toBeGreaterThan(10);
    }

    // Spot-check messages
    expect(data.messages).toBeDefined();

    // Spot-check visits
    expect(data.upcomingVisits).toBeDefined();
    expect(data.pastVisits).toBeDefined();

    // Spot-check lab results
    expect(data.labResults).toBeDefined();
  }, 120_000); // Scraping can take a while
});
