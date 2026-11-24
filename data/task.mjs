export const TASK = {
  title: 'Open Desk policy review',
  intro: 'Northmere Public Library is publishing a guide to its Open Desk workshops. Check three draft claims against the cited documents. The library, programme, and documents are fictional.',
  durationSeconds: 90,
  claims: [
    {
      id: 'waitlist-deadline',
      text: 'If the programme desk sends a waitlist offer on Friday, the learner can accept it until 6 p.m. on Tuesday, provided Monday and Tuesday are both working days.',
      sourceId: 'registration-handbook',
      paragraphId: 'accepting-an-offer',
      answer: 'supported',
      explanation: 'The handbook gives the learner until 6 p.m. on the second working day after the offer is sent. Saturday and Sunday do not count, so Monday is the first working day and Tuesday is the second.',
    },
    {
      id: 'transfer-approval',
      text: 'A branch librarian can approve a learner’s request to move to a different session of the same workshop.',
      sourceId: 'branch-operations',
      paragraphId: 'session-transfers',
      answer: 'contradicted',
      explanation: 'A branch librarian can log a transfer request. The programme coordinator is the only person who can approve it.',
    },
    {
      id: 'headset-microphone',
      text: 'The loan headsets used for the audio exercise have built-in microphones.',
      sourceId: 'learner-guide',
      paragraphId: 'equipment-loans',
      answer: 'insufficient',
      explanation: 'The guide confirms that some locations have loan headsets and explains how to reserve them. It gives no specifications, so the cited documents cannot establish whether they have built-in microphones.',
    },
  ],
  sources: [
    {
      id: 'registration-handbook',
      title: 'Open Desk Registration Handbook',
      paragraphs: [
        {
          id: 'workshop-access',
          label: '1. Who can join',
          body: 'Open Desk workshops are free to attend. The programme is open to Northmere residents aged 14 or above. A library card is optional.',
        },
        {
          id: 'booking-a-seat',
          label: '2. Booking a seat',
          body: 'Learners can book on the workshop page or call the programme desk. A booking is confirmed when the desk sends the learner a confirmation email. Learners may hold one confirmed seat per workshop title.',
        },
        {
          id: 'joining-the-waitlist',
          label: '3. Joining the waitlist',
          body: 'When a session fills, the workshop page offers a waitlist. The programme desk makes offers in the order requests arrived. Waitlist membership does not reserve a seat.',
        },
        {
          id: 'accepting-an-offer',
          label: '4. Accepting a waitlist offer',
          body: 'Learners may accept by replying to the offer email or calling the programme desk. Acceptance closes at 6 p.m. on the second working day after the desk sends the offer. Saturdays, Sundays and published library holidays do not count as working days.',
        },
        {
          id: 'giving-up-a-seat',
          label: '5. Giving up a seat',
          body: 'Learners who cannot attend should cancel through the booking link or call the programme desk. When a cancellation creates an opening, the desk contacts the next person on the waitlist.',
        },
      ],
    },
    {
      id: 'branch-operations',
      title: 'Open Desk Branch Operations Guide',
      paragraphs: [
        {
          id: 'opening-the-room',
          label: '1. Opening the room',
          body: 'The duty librarian opens the room 15 minutes before a session. Staff check that the computers can sign in and that access routes are clear before anyone enters.',
        },
        {
          id: 'checking-in',
          label: '2. Checking in learners',
          body: 'The facilitator checks each learner against the programme desk’s attendance list. A learner can give their name instead of showing a library card. Staff send unresolved booking questions to the programme desk.',
        },
        {
          id: 'releasing-seats',
          label: '3. Releasing unused seats',
          body: 'The facilitator reports any unclaimed seats to the programme desk 10 minutes after a workshop begins. The desk decides whether an opening can be offered for that session.',
        },
        {
          id: 'session-transfers',
          label: '4. Moving a booking',
          body: 'A branch librarian may record a request to move a learner’s booking to a different session of the same workshop. The librarian sends it to the programme coordinator, who alone may approve the move. Until the coordinator confirms it, the original booking remains in place.',
        },
        {
          id: 'closing-the-room',
          label: '5. Closing the room',
          body: 'The facilitator checks that learners return loan equipment and sign out of the computers. The duty librarian records missing or damaged items before closing the room.',
        },
      ],
    },
    {
      id: 'learner-guide',
      title: 'Your First Open Desk Workshop',
      paragraphs: [
        {
          id: 'finding-your-room',
          label: '1. Finding your room',
          body: 'Your confirmation email includes the branch, start time and room name. If you cannot find the room, ask at the branch desk and give the workshop name.',
        },
        {
          id: 'what-to-bring',
          label: '2. What to bring',
          body: 'You can use a library computer or bring a charged laptop if your workshop page allows it. Keep the confirmation email handy. You do not need to print it.',
        },
        {
          id: 'equipment-loans',
          label: '3. Loan equipment for the audio exercise',
          body: 'Some branches keep loan headsets for the audio exercise. Check your session page for availability and reserve a headset through the programme desk if the page asks you to book one. Collect your loan at check-in.',
        },
        {
          id: 'access-needs',
          label: '4. Access needs',
          body: 'If you need a large-print worksheet, a quieter seat or help using a library computer, contact the programme desk before the session. Staff can discuss what the branch can arrange.',
        },
        {
          id: 'after-the-session',
          label: '5. After the session',
          body: 'Return anything you borrowed to the facilitator. The workshop page stays available after the session so you can revisit the exercises and print another copy of the worksheet.',
        },
      ],
    },
  ],
};
