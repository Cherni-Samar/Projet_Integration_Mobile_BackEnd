function emailToClient(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  const id = o._id ? o._id.toString() : o.id;
  return {
    id,
    subject: o.subject,
    sender: o.sender,
    content: o.content,
    summary: o.summary,
    isUrgent: !!o.isUrgent,
    isSpam: !!o.isSpam,
    priority: o.priority,
    actions: Array.isArray(o.actions) ? o.actions : [],
    category: o.category,
    receivedAt:
      o.receivedAt instanceof Date
        ? o.receivedAt.toISOString()
        : o.receivedAt || new Date().toISOString(),
    isRead: !!o.isRead,
    ...(o.inReplyTo && { inReplyTo: o.inReplyTo.toString() }),
    ...(o.to && { to: o.to }),
    ...(o.willSendIn && { willSendIn: o.willSendIn }),
  };
}

module.exports = { emailToClient };