import React, { useState, useEffect } from 'react';
import { Users, Search, Download, Filter, MessageSquare, PhoneCall, Mail, Sparkles, RefreshCw, X, Copy, Check } from 'lucide-react';
import { api } from '../services/api';

interface LeadsDashboardProps {
  businessId: string;
  onToast: (title: string, message: string, type: 'success' | 'alert' | 'info') => void;
}

export const LeadsDashboard: React.FC<LeadsDashboardProps> = ({ businessId, onToast }) => {
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  
  // AI Lead Assistant Drawer state
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [aiAssistData, setAiAssistData] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [generatedText, setGeneratedText] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const fetchLeads = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.leads.getAll(businessId),
        api.leads.getStats(businessId),
      ]);
      setLeads(leadsRes.leads || []);
      setStats(statsRes);
    } catch (err: any) {
      onToast('Error', err.message || 'Failed to fetch leads', 'alert');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [businessId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return fetchLeads();
    setLoading(true);
    try {
      const res = await api.leads.search(businessId, searchQuery);
      setLeads(res.leads || []);
    } catch (err: any) {
      onToast('Search Failed', err.message, 'alert');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csvData = await api.leads.exportCsv(businessId);
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_${businessId}_${Date.now()}.csv`;
      a.click();
      onToast('Exported', 'Leads downloaded successfully as CSV', 'success');
    } catch (err: any) {
      onToast('Export Failed', err.message, 'alert');
    }
  };

  const handleStatusChange = async (leadId: string, status: string) => {
    try {
      await api.leads.update(leadId, { status });
      onToast('Status Updated', `Lead status changed to ${status}`, 'success');
      fetchLeads();
    } catch (err: any) {
      onToast('Error', err.message, 'alert');
    }
  };

  const handleOpenAiAssist = async (lead: any) => {
    setSelectedLead(lead);
    setLoadingAi(true);
    setGeneratedText('');
    setCopied(false);
    try {
      const data = await api.leads.getAiAssist(lead.id);
      setAiAssistData(data);
    } catch (err: any) {
      onToast('AI Error', err.message || 'Failed to generate AI lead analysis', 'alert');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleGenerateWhatsApp = async () => {
    if (!selectedLead) return;
    setLoadingAi(true);
    setCopied(false);
    try {
      const res = await api.leads.generateWhatsApp(selectedLead.id);
      setGeneratedText(res.message || '');
    } catch (err: any) {
      onToast('Error', err.message, 'alert');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleGenerateEmail = async () => {
    if (!selectedLead) return;
    setLoadingAi(true);
    setCopied(false);
    try {
      const res = await api.leads.generateEmail(selectedLead.id);
      setGeneratedText(res.message || '');
    } catch (err: any) {
      onToast('Error', err.message, 'alert');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleGenerateCallScript = async () => {
    if (!selectedLead) return;
    setLoadingAi(true);
    setCopied(false);
    try {
      const res = await api.leads.generateCallScript(selectedLead.id);
      setGeneratedText(res.script || '');
    } catch (err: any) {
      onToast('Error', err.message, 'alert');
    } finally {
      setLoadingAi(false);
    }
  };

  const filteredLeads = leads.filter((l) => {
    if (selectedStatus === 'ALL') return true;
    return (l.status || 'NEW') === selectedStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW': return { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
      case 'CONTACTED': return { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' };
      case 'QUALIFIED': return { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' };
      case 'CONVERTED': return { bg: 'rgba(236, 72, 153, 0.12)', color: '#ec4899', border: 'rgba(236, 72, 153, 0.3)' };
      case 'ARCHIVED': return { bg: 'rgba(100, 116, 139, 0.12)', color: '#64748b', border: 'rgba(100, 116, 139, 0.3)' };
      default: return { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' };
    }
  };

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={26} color="#6366f1" />
            <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              Lead Management
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={fetchLeads}
            className="btn-secondary"
            title="Refresh Leads"
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExportCsv}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: '0.875rem' }}
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
            Total Leads
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-main)', marginTop: 6 }}>
            {stats?.total || leads.length || 0}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.05em' }}>
            New Leads
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: 6 }}>
            {stats?.byStatus?.NEW || leads.filter(l => (l.status || 'NEW') === 'NEW').length}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6366f1', letterSpacing: '0.05em' }}>
            Contacted
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6366f1', marginTop: 6 }}>
            {stats?.byStatus?.CONTACTED || leads.filter(l => l.status === 'CONTACTED').length}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#ec4899', letterSpacing: '0.05em' }}>
            Converted
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ec4899', marginTop: 6 }}>
            {stats?.byStatus?.CONVERTED || leads.filter(l => l.status === 'CONVERTED').length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 24, borderRadius: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: 10, minWidth: 280 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Search leads by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: 38,
                  paddingRight: 14,
                  paddingTop: 10,
                  paddingBottom: 10,
                  fontSize: '0.85rem',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-start)',
                  color: 'var(--color-text-main)',
                  outline: 'none'
                }}
              />
            </div>
            <button type="submit" className="btn-secondary" style={{ padding: '10px 18px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600 }}>
              Search
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={16} style={{ color: 'var(--color-text-muted)' }} />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '10px 14px',
                fontSize: '0.85rem',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-start)',
                color: 'var(--color-text-main)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="CONVERTED">Converted</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      {loading ? (
        <div className="glass-panel" style={{ padding: 48, textAlign: 'center', borderRadius: 16 }}>
          <RefreshCw size={24} className="animate-spin" style={{ color: '#6366f1', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Loading customer leads...</div>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="glass-panel" style={{ padding: 48, textAlign: 'center', borderRadius: 16, borderStyle: 'dashed' }}>
          <Users size={40} style={{ color: 'var(--color-text-muted)', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700 }}>No Leads Found</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', maxWidth: 420, margin: '0 auto' }}>
            Connect Meta Lead Ads or capture leads via your website form to view them in your CRM.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'rgba(99, 102, 241, 0.05)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Lead Name</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Contact Info</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Source & Campaign</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Status</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'right' }}>AI Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const statusStyle = getStatusColor(lead.status || 'NEW');
                  return (
                    <tr key={lead.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem'
                          }}>
                            {(lead.name || 'L').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div>{lead.name}</div>
                            {lead.requirement && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400, marginTop: 2 }}>
                                {lead.requirement}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 500 }}>{lead.email}</div>
                        {lead.phone && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{lead.phone}</div>}
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
                          background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1'
                        }}>
                          {lead.source || 'META_ADS'}
                        </span>
                        {lead.campaign && <div style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: 4, fontWeight: 600 }}>{lead.campaign}</div>}
                      </td>

                      <td style={{ padding: '16px 20px' }}>
                        <select
                          value={lead.status || 'NEW'}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.75rem',
                            borderRadius: 8,
                            border: `1px solid ${statusStyle.border}`,
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <option value="NEW">NEW</option>
                          <option value="CONTACTED">CONTACTED</option>
                          <option value="QUALIFIED">QUALIFIED</option>
                          <option value="CONVERTED">CONVERTED</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                      </td>

                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenAiAssist(lead)}
                          className="btn-secondary"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                            borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, color: '#6366f1',
                            borderColor: 'rgba(99, 102, 241, 0.3)', background: 'rgba(99, 102, 241, 0.08)'
                          }}
                        >
                          <Sparkles size={14} />
                          <span>AI Assist</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Lead Assistant Modal / Drawer */}
      {selectedLead && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="glass-panel" style={{
            maxWidth: 640, width: '100%', padding: 28, borderRadius: 20, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 16, marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="#6366f1" /> AI Assistant for {selectedLead.name}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {selectedLead.email} • {selectedLead.phone || 'No phone'}
                </p>
              </div>
              <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {loadingAi ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <RefreshCw size={24} className="animate-spin" style={{ color: '#6366f1', margin: '0 auto 12px' }} />
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Analyzing lead data with AI...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Priority & Summary Banner */}
                {aiAssistData && (
                  <div style={{
                    padding: 16, borderRadius: 12, background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.2)', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>AI Lead Analysis</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', marginTop: 4 }}>{aiAssistData.summary}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Priority</div>
                      <div style={{
                        display: 'inline-block', marginTop: 4, padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800,
                        background: aiAssistData.priority?.level === 'HIGH' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: aiAssistData.priority?.level === 'HIGH' ? '#ef4444' : '#f59e0b'
                      }}>
                        {aiAssistData.priority?.level || 'MEDIUM'} PRIORITY
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Action Tabs */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleGenerateWhatsApp}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#10b981',
                      color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    <MessageSquare size={14} /> WhatsApp Message
                  </button>
                  <button
                    onClick={handleGenerateEmail}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#6366f1',
                      color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    <Mail size={14} /> Email Draft
                  </button>
                  <button
                    onClick={handleGenerateCallScript}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#a855f7',
                      color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}
                  >
                    <PhoneCall size={14} /> Call Script
                  </button>
                </div>

                {/* Output Text Area */}
                {generatedText ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Generated Material:</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedText);
                          setCopied(true);
                          onToast('Copied', 'Text copied to clipboard!', 'info');
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        style={{
                          background: 'none', border: 'none', color: '#6366f1', fontSize: '0.75rem',
                          fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                        }}
                      >
                        {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      rows={8}
                      value={generatedText}
                      style={{
                        width: '100%', fontSize: '0.85rem', fontFamily: 'monospace', padding: 14, borderRadius: 12,
                        border: '1px solid var(--color-border)', background: 'var(--color-bg-start)', color: 'var(--color-text-main)',
                        outline: 'none', resize: 'vertical'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 12 }}>
                    Click one of the buttons above to generate a WhatsApp message, Email reply, or Call script for this lead.
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedLead(null)}
                className="btn-secondary"
                style={{ padding: '8px 18px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
