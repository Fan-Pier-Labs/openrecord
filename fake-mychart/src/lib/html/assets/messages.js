var currentConvId = null;

// Load conversation list
function loadConversations() {
  fetch('{{MP}}/api/conversations/getconversationlist', { method: 'POST', credentials: 'same-origin' })
    .then(r => r.json()).then(data => {
      var convs = data.conversations || [];
      if (convs.length === 0) {
        document.getElementById('content').innerHTML = '<p>No messages.</p>';
        return;
      }
      document.getElementById('content').innerHTML = '<div class="msg-list">' +
        convs.map(c => '<div class="msg-item" onclick="loadThread(\'' + c.hthId + '\')">' +
          '<div class="msg-subject">' + c.subject + '</div>' +
          '<div class="msg-preview">' + (c.previewText || '') + '</div>' +
          '<div class="msg-meta">With: ' + (c.audience || []).map(a => a.name).join(', ') + '</div>' +
        '</div>').join('') + '</div>';
    });
}

// Load a thread and show reply box
function loadThread(convId) {
  currentConvId = convId;
  fetch('{{MP}}/api/conversations/getconversationmessages', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: convId })
  }).then(r => r.json()).then(data => {
    var thread = document.getElementById('thread');
    var msgs = data.messages || [];
    var html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
      '<h2 style="margin:0;">Conversation</h2>' +
      '<button onclick="closeThread()" style="padding:6px 12px; background:#eee; color:#333; border:1px solid #ccc; border-radius:4px; font-size:13px; cursor:pointer;">Back to inbox</button></div>';
    html += msgs.map(m => {
      var isPatient = m.author.wprKey && !m.author.empKey;
      return '<div class="msg-bubble ' + (isPatient ? 'patient' : 'provider') + '">' +
        '<div class="author">' + m.author.displayName + '</div>' +
        '<div class="body">' + m.body + '</div>' +
        '<div class="time">' + new Date(m.deliveryInstantISO).toLocaleString() + '</div>' +
      '</div>';
    }).join('');
    // Reply box
    html += '<div style="margin-top:16px; padding-top:16px; border-top:1px solid #e0e0e0;">' +
      '<label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px;">Reply:</label>' +
      '<textarea id="replyBody" rows="3" placeholder="Type your reply..." style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:14px; resize:vertical; margin-bottom:8px;"></textarea>' +
      '<button onclick="sendReply()" style="padding:8px 16px; background:#1a5276; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:600; cursor:pointer;">Send Reply</button>' +
    '</div>';
    thread.innerHTML = html;
    thread.classList.add('visible');
    thread.scrollIntoView({ behavior: 'smooth' });
  });
}

function closeThread() {
  currentConvId = null;
  document.getElementById('thread').classList.remove('visible');
  document.getElementById('thread').innerHTML = '';
}

// Send reply to current thread
function sendReply() {
  var body = document.getElementById('replyBody').value.trim();
  if (!body) { alert('Please enter a reply.'); return; }
  fetch('{{MP}}/api/conversations/sendreply', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: currentConvId, messageBody: body })
  }).then(r => r.json()).then(() => {
    loadThread(currentConvId);
    loadConversations();
  });
}

// Compose new message
function showCompose() {
  document.getElementById('compose').classList.add('visible');
  // Load recipients
  fetch('{{MP}}/api/medicaladvicerequests/getmedicaladvicerequestrecipients', { method: 'POST', credentials: 'same-origin' })
    .then(r => r.json()).then(data => {
      var recipients = Array.isArray(data) ? data : [];
      var sel = document.getElementById('composeRecipient');
      sel.innerHTML = '<option value="">Select a provider...</option>' +
        recipients.map(r => '<option value="' + r.id + '" data-name="' + r.name + '">' + r.name + ' (' + r.specialty + ')</option>').join('');
    });
  // Load topics
  fetch('{{MP}}/api/medicaladvicerequests/getsubtopics', { method: 'POST', credentials: 'same-origin' })
    .then(r => r.json()).then(data => {
      var topics = data.topicList || [];
      var sel = document.getElementById('composeTopic');
      sel.innerHTML = '<option value="">Select a topic...</option>' +
        topics.map(t => '<option value="' + t.id + '">' + t.name + '</option>').join('');
    });
}

function hideCompose() {
  document.getElementById('compose').classList.remove('visible');
  document.getElementById('composeSubject').value = '';
  document.getElementById('composeBody').value = '';
}

function sendNewMessage() {
  var recipientEl = document.getElementById('composeRecipient');
  var recipientId = recipientEl.value;
  var recipientName = recipientEl.options[recipientEl.selectedIndex].getAttribute('data-name') || '';
  var subject = document.getElementById('composeSubject').value.trim();
  var body = document.getElementById('composeBody').value.trim();
  if (!recipientId) { alert('Please select a provider.'); return; }
  if (!subject) { alert('Please enter a subject.'); return; }
  if (!body) { alert('Please enter a message.'); return; }

  // Get compose ID first
  fetch('{{MP}}/api/conversations/getcomposeid', { method: 'POST', credentials: 'same-origin' })
    .then(r => r.json()).then(composeId => {
      // Send the message
      return fetch('{{MP}}/api/medicaladvicerequests/sendmedicaladvicerequest', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: recipientId, recipientName: recipientName, subject: subject, messageBody: body, composeId: composeId })
      });
    })
    .then(r => r.json()).then(() => {
      // Clean up compose ID
      fetch('{{MP}}/api/conversations/removecomposeid', { method: 'POST', credentials: 'same-origin' });
      hideCompose();
      loadConversations();
    });
}

// Initial load
loadConversations();
