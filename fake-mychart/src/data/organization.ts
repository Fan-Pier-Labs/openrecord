// Organization-level data: the same for every patient record on the instance.
//
// Real MyChart scopes chart data to the record the session is in (see
// `lib/dataset.ts`), but some surfaces describe the *organization*, not a
// patient. Those live here, outside the per-patient datasets, so a proxy
// record — which empties every chart category it doesn't override — still
// sees them exactly as the account holder does. That mirrors the capture:
// the payer catalogue request carries no patient identifier, and a real
// department id returned the identical list.
//
// All fictional.

/**
 * The insurance payers this organization offers when a patient adds a
 * coverage — `POST /Insurance/Coverages/GetPayors`, the legacy Insurance
 * activity's catalogue. Captured on four live instances: every payer id is
 * an opaque `WP-` string unique to its organization (none was shared between
 * instances), `Fields` maps a coverage-form field to 1 (shown, optional) or
 * 2 (shown, required), `SampleCardImages` was empty and `SortKey`/`NameUTF8`
 * null on every entry, and no instance carried a free-text
 * `IsNonConfiguredPayer` entry. The three field patterns below are the three
 * observed on real catalogues; the ids are synthetic but shape-realistic.
 */
export const insurancePayers = [
  {
    Fields: { MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
    SampleCardImages: [],
    CanUpload: true,
    IsNonConfiguredPayer: false,
    SortKey: null,
    ID: 'WP-24Q7mK2vX9cL4nR8tB1wZ5yP3-3D-3D-24hG6jD0sF7aM2kN9pV4rT8uW1xC3eY5bL7q-3D',
    Name: 'Springfield Mutual Health',
    NameUTF8: null,
  },
  {
    Fields: { MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
    SampleCardImages: [],
    CanUpload: true,
    IsNonConfiguredPayer: false,
    SortKey: null,
    ID: 'WP-24Z3nW8bK1vT6yC9mQ2xL5pR7-3D-3D-24sD4fH0jG8aN3kM6pB1rV9uX2wE5cY7tL0q-3D',
    Name: 'Springfield Mutual Health - Medicare Advantage',
    NameUTF8: null,
  },
  {
    Fields: { GroupNumber: 1, MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
    SampleCardImages: [],
    CanUpload: true,
    IsNonConfiguredPayer: false,
    SortKey: null,
    ID: 'WP-24L5pR9cX2vB7nK4mT1wQ8yZ3-3D-3D-24aF6hJ0gD9sM4kN7pV2rB5uW8xC1eY3tL6q-3D',
    Name: 'Shelbyville Blue Cross',
    NameUTF8: null,
  },
  {
    Fields: { MemberId: 2 },
    SampleCardImages: [],
    CanUpload: true,
    IsNonConfiguredPayer: false,
    SortKey: null,
    ID: 'WP-24B8yT3nQ6vK1cX9mR4wL7pZ2-3D-3D-24jH5gF0dS8aM3kN6pV1rB4uW7xC0eY2tL5q-3D',
    Name: 'Medicare',
    NameUTF8: null,
  },
  {
    Fields: { MemberId: 2, SubscriberDateOfBirth: 1, SubscriberFirstName: 2, SubscriberId: 1, SubscriberLastName: 2 },
    SampleCardImages: [],
    CanUpload: true,
    IsNonConfiguredPayer: false,
    SortKey: null,
    ID: 'WP-24X2vB6nK9cQ4mT7wR1yL8pZ5-3D-3D-24dS3fH0gJ7aM2kN5pV8rB1uW4xC9eY6tL3q-3D',
    Name: 'Globex Corporation Employee Health Plan',
    NameUTF8: null,
  },
] as const;
