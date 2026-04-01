"use client";

import { useState, useCallback, useRef } from "react";

export function useScrapeActions(token: string) {
  // Letter state
  const [letterHtml, setLetterHtml] = useState<Record<string, string>>({});
  const [loadingLetters, setLoadingLetters] = useState<Record<string, boolean>>({});

  // Billing statement state
  const [loadingStatements, setLoadingStatements] = useState<Record<string, boolean>>({});

  // Messaging state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [showComposeNew, setShowComposeNew] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [composeRecipients, setComposeRecipients] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [composeTopics, setComposeTopics] = useState<any[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedTopic, setSelectedTopic] = useState<any>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sendingNew, setSendingNew] = useState(false);
  const [messageStatus, setMessageStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // X-ray viewing state
  const [xrayImages, setXrayImages] = useState<Record<number, string | null>>({});
  const [xrayLoading, setXrayLoading] = useState<Record<number, boolean>>({});
  const [xrayErrors, setXrayErrors] = useState<Record<number, string | null>>({});

  const fetchXray = useCallback(async (index: number, fdiContext: { fdi: string; ord: string }) => {
    setXrayLoading(prev => ({ ...prev, [index]: true }));
    setXrayErrors(prev => ({ ...prev, [index]: null }));
    try {
      const fdiParam = btoa(JSON.stringify(fdiContext));
      const resp = await fetch(`/api/mychart-xray?token=${encodeURIComponent(token)}&fdi=${encodeURIComponent(fdiParam)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Failed to load X-ray' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setXrayImages(prev => ({ ...prev, [index]: url }));
    } catch (err) {
      const msg = (err as Error).message;
      setXrayErrors(prev => ({ ...prev, [index]: msg.length > 200 ? msg.slice(0, 200) + '…' : msg }));
    } finally {
      setXrayLoading(prev => ({ ...prev, [index]: false }));
    }
  }, [token]);

  const fetchLetterContent = useCallback(async (hnoId: string, csn: string) => {
    const key = `${hnoId}-${csn}`;
    if (letterHtml[key]) return;
    setLoadingLetters(prev => ({ ...prev, [key]: true }));
    try {
      const resp = await fetch('/api/letter-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, hnoId, csn }),
      });
      const data = await resp.json();
      if (data.bodyHTML) {
        setLetterHtml(prev => ({ ...prev, [key]: data.bodyHTML }));
      }
    } catch (err) {
      console.error('Failed to fetch letter:', err);
    } finally {
      setLoadingLetters(prev => ({ ...prev, [key]: false }));
    }
  }, [token, letterHtml]);

  const downloadLetterPdf = useCallback((hnoId: string, csn: string, reason: string) => {
    const key = `${hnoId}-${csn}`;
    const html = letterHtml[key];
    if (!html) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>${reason}</title><style>@media print { body { margin: 0; } }</style></head><body>${html}</body></html>`);
      printWindow.document.close();
    }
  }, [letterHtml]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchStatementPdf = useCallback(async (encBillingId: string, statement: any, action: 'view' | 'download') => {
    const key = `${statement.RecordID}-${statement.DateDisplay}`;
    setLoadingStatements(prev => ({ ...prev, [key]: true }));
    try {
      const resp = await fetch('/api/billing-statement-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, encBillingId, statement }),
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (action === 'view') {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Statement_${statement.FormattedDateDisplay || statement.DateDisplay}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to fetch statement PDF:', err);
    } finally {
      setLoadingStatements(prev => ({ ...prev, [key]: false }));
    }
  }, [token]);

  const handleSendReply = useCallback(async (conversationId: string) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    setMessageStatus(null);
    try {
      const resp = await fetch('/api/messages/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, conversationId, messageBody: replyText }),
      });
      const data = await resp.json();
      if (data.success) {
        setMessageStatus({ type: 'success', text: 'Reply sent successfully' });
        setReplyText("");
        setReplyingTo(null);
      } else {
        setMessageStatus({ type: 'error', text: data.error || 'Failed to send reply' });
      }
    } catch (err) {
      setMessageStatus({ type: 'error', text: (err as Error).message });
    } finally {
      setSendingReply(false);
    }
  }, [token, replyText]);

  const handleOpenCompose = useCallback(async () => {
    setShowComposeNew(true);
    if (composeRecipients.length > 0) return; // already loaded
    setComposeLoading(true);
    try {
      const resp = await fetch('/api/messages/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await resp.json();
      setComposeRecipients(data.recipients || []);
      setComposeTopics(data.topics || []);
      if (data.recipients?.length > 0) setSelectedRecipient(data.recipients[0]);
      if (data.topics?.length > 0) setSelectedTopic(data.topics[0]);
    } catch (err) {
      setMessageStatus({ type: 'error', text: 'Failed to load recipients: ' + (err as Error).message });
    } finally {
      setComposeLoading(false);
    }
  }, [token, composeRecipients.length]);

  const handleSendNew = useCallback(async () => {
    if (!selectedRecipient || !selectedTopic || !composeSubject.trim() || !composeBody.trim()) return;
    setSendingNew(true);
    setMessageStatus(null);
    try {
      const resp = await fetch('/api/messages/send-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          recipient: selectedRecipient,
          topic: selectedTopic,
          subject: composeSubject,
          messageBody: composeBody,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setMessageStatus({ type: 'success', text: 'Message sent successfully' });
        setComposeSubject("");
        setComposeBody("");
        setShowComposeNew(false);
      } else {
        setMessageStatus({ type: 'error', text: data.error || 'Failed to send message' });
      }
    } catch (err) {
      setMessageStatus({ type: 'error', text: (err as Error).message });
    } finally {
      setSendingNew(false);
    }
  }, [token, selectedRecipient, selectedTopic, composeSubject, composeBody]);

  return {
    // Letter actions
    letterHtml, setLetterHtml, loadingLetters, fetchLetterContent, downloadLetterPdf,
    // Statement actions
    loadingStatements, fetchStatementPdf,
    // Messaging
    replyingTo, setReplyingTo, replyText, setReplyText, sendingReply,
    showComposeNew, setShowComposeNew, composeRecipients, composeTopics,
    composeLoading, selectedRecipient, setSelectedRecipient, selectedTopic,
    setSelectedTopic, composeSubject, setComposeSubject, composeBody, setComposeBody,
    sendingNew, messageStatus, setMessageStatus, replyTextareaRef,
    handleSendReply, handleOpenCompose, handleSendNew,
    // X-ray actions
    xrayImages, xrayLoading, xrayErrors, fetchXray,
  };
}
