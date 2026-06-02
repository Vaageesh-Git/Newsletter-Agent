import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Play, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Download, 
  Check, 
  FileText, 
  Eye, 
  RefreshCw, 
  Clock, 
  ArrowRight,
  UserCheck,
  Search,
  BookOpen,
  ChevronRight,
  Home
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

function App() {
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState('auto'); // 'auto' or 'hitl'
  const [taskId, setTaskId] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusDetail, setStatusDetail] = useState('');
  const [steps, setSteps] = useState([
    { name: 'Plan', status: 'pending' },
    { name: 'Research', status: 'pending' },
    { name: 'Summarize', status: 'pending' },
    { name: 'Write', status: 'pending' },
    { name: 'Critique', status: 'pending' },
    { name: 'Output', status: 'pending' }
  ]);

  // Current newsletter output
  const [newsletter, setNewsletter] = useState(null);
  
  // Saved newsletters list
  const [savedList, setSavedList] = useState([]);
  const [selectedSavedName, setSelectedSavedName] = useState('');
  const [selectedSavedHtml, setSelectedSavedHtml] = useState('');
  const [selectedSavedSubject, setSelectedSavedSubject] = useState('');
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Polling ref to clear interval
  const pollIntervalRef = useRef(null);

  // Fetch saved newsletters on mount
  useEffect(() => {
    fetchSavedNewsletters();
  }, []);

  const fetchSavedNewsletters = async () => {
    try {
      const res = await fetch(`${API_BASE}/newsletters`);
      if (res.ok) {
        const data = await res.json();
        setSavedList(data);
      }
    } catch (err) {
      console.error("Error fetching saved newsletters:", err);
    }
  };

  const fetchNewsletterContent = async (filename) => {
    setLoadingSaved(true);
    setSelectedSavedName(filename);
    try {
      const res = await fetch(`${API_BASE}/newsletter/${filename}`);
      if (res.ok) {
        const html = await res.text();
        setSelectedSavedHtml(html);
        
        // Find subject from saved metadata if possible, or build nice representation
        const matched = savedList.find(s => s.filename === filename);
        setSelectedSavedSubject(filename.replace('.html', '').replace('newsletter_', 'Newsletter '));
      }
    } catch (err) {
      console.error("Error fetching newsletter content:", err);
    } finally {
      setLoadingSaved(false);
    }
  };

  // Helper to generate a unique task ID
  const generateTaskId = () => {
    return 'task_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  };

  // Poll status endpoint
  const startPolling = (tId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${tId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.steps_log) {
            setSteps(data.steps_log);
          }
          if (data.current_detail) {
            setStatusDetail(data.current_detail);
          }
        }
      } catch (err) {
        console.error("Error polling task status:", err);
      }
    }, 1000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!goal.trim()) return;

    setNewsletter(null);
    setSelectedSavedName('');
    setSelectedSavedHtml('');
    setLoading(true);
    
    const newTaskId = generateTaskId();
    setTaskId(newTaskId);
    
    // Reset steps UI to pending
    setSteps([
      { name: 'Plan', status: 'pending' },
      { name: 'Research', status: 'pending' },
      { name: 'Summarize', status: 'pending' },
      { name: 'Write', status: 'pending' },
      { name: 'Critique', status: 'pending' },
      { name: 'Output', status: 'pending' }
    ]);
    setStatusDetail('Starting pipeline...');

    // Start polling status
    startPolling(newTaskId);

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal,
          mode: mode,
          taskId: newTaskId
        })
      });

      stopPolling();

      if (res.ok) {
        const data = await res.json();
        setNewsletter(data);
        // Sync final steps log
        if (data.steps_log) {
          setSteps(data.steps_log);
        }
        setStatusDetail(data.awaiting_approval ? 'Awaiting human approval.' : 'Newsletter generated successfully!');
        fetchSavedNewsletters(); // Refresh sidebar list
      } else {
        const errorData = await res.json();
        setStatusDetail(`Error: ${errorData.detail || 'Failed to generate newsletter'}`);
        // Set running steps to error
        setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
      }
    } catch (err) {
      stopPolling();
      setStatusDetail(`Connection error: ${err.message}`);
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!newsletter || !newsletter.session_id) return;
    setLoading(true);
    setStatusDetail('Approving and saving newsletter...');
    
    // Set output step to running
    setSteps(prev => prev.map(s => s.name === 'Output' ? { ...s, status: 'running' } : s));
    
    try {
      const res = await fetch(`${API_BASE}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: newsletter.session_id,
          taskId: taskId
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setNewsletter(data);
        if (data.steps_log) {
          setSteps(data.steps_log);
        }
        setStatusDetail('Newsletter approved and saved to server.');
        fetchSavedNewsletters(); // Refresh list
      } else {
        const errorData = await res.json();
        setStatusDetail(`Approval error: ${errorData.detail || 'Failed to approve'}`);
        setSteps(prev => prev.map(s => s.name === 'Output' ? { ...s, status: 'error' } : s));
      }
    } catch (err) {
      setStatusDetail(`Approval connection error: ${err.message}`);
      setSteps(prev => prev.map(s => s.name === 'Output' ? { ...s, status: 'error' } : s));
    } finally {
      setLoading(false);
    }
  };

  const downloadNewsletterLocally = () => {
    const htmlToDownload = selectedSavedHtml || (newsletter && newsletter.html);
    const subjectToUse = selectedSavedSubject || (newsletter && newsletter.subject) || 'newsletter';
    if (!htmlToDownload) return;

    const blob = new Blob([htmlToDownload], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${subjectToUse.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to render step badges
  const getStepIcon = (status) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50/50" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-500 fill-rose-50/50" />;
      case 'paused':
        return <UserCheck className="w-5 h-5 text-amber-500 animate-pulse" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-slate-300" />;
    }
  };

  const getStepClass = (status) => {
    switch (status) {
      case 'done':
        return 'border-emerald-100 bg-emerald-50/30 text-emerald-800 dark:text-emerald-300';
      case 'running':
        return 'border-indigo-100 bg-indigo-50/30 text-indigo-800 dark:text-indigo-300 ring-2 ring-indigo-500/20';
      case 'error':
        return 'border-rose-100 bg-rose-50/30 text-rose-800 dark:text-rose-300';
      case 'paused':
        return 'border-amber-100 bg-amber-50/30 text-amber-800 dark:text-amber-300 ring-2 ring-amber-500/20';
      default:
        return 'border-slate-100 text-slate-400';
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      
      {/* SIDEBAR: Saved Newsletters */}
      <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-600/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Newsletter Agent
            </h1>
            <p className="text-xs text-slate-400">Autonomous AI Assistant</p>
          </div>
        </div>

        {/* Saved List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-3">
            <span>Saved Newsletters</span>
            <span className="bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">
              {savedList.length}
            </span>
          </div>

          {savedList.length === 0 ? (
            <div className="text-center py-8 px-4 border border-dashed border-slate-800 rounded-xl text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No newsletters saved yet.</p>
            </div>
          ) : (
            savedList.map((item) => {
              const isActive = selectedSavedName === item.filename;
              const formattedDate = new Date(item.created_at * 1000).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              const readableTitle = item.filename
                .replace('.html', '')
                .replace(/^newsletter_\d+_\d+_/, '')
                .replace(/^newsletter_/, '')
                .replace(/_/g, ' ');

              return (
                <button
                  key={item.filename}
                  onClick={() => fetchNewsletterContent(item.filename)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-200 border flex items-start space-x-3 group ${
                    isActive 
                      ? 'bg-slate-800/80 border-indigo-500/50 shadow-md text-white' 
                      : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-850 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg flex-shrink-0 mt-0.5 ${
                    isActive ? 'bg-indigo-650 text-indigo-200' : 'bg-slate-800 text-slate-400 group-hover:text-indigo-400 group-hover:bg-slate-750'
                  }`}>
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate capitalize group-hover:text-white transition-colors">
                      {readableTitle || 'Generated Digest'}
                    </p>
                    <div className="flex items-center space-x-2 mt-1 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span>{formattedDate}</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 mt-2 transition-transform duration-200 ${
                    isActive ? 'text-indigo-400 transform translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                  }`} />
                </button>
              );
            })
          )}
        </div>

        {/* Reset / Go back to home */}
        {(selectedSavedName || newsletter) && (
          <div className="p-4 border-t border-slate-800">
            <button
              onClick={() => {
                setNewsletter(null);
                setSelectedSavedName('');
                setSelectedSavedHtml('');
              }}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-300 flex items-center justify-center space-x-2 transition-all"
            >
              <Home className="w-4 h-4" />
              <span>Create New Newsletter</span>
            </button>
          </div>
        )}
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="max-w-5xl w-full mx-auto p-8 space-y-8 flex-1 flex flex-col">
          
          {/* HEADER BAR */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                {selectedSavedName ? 'Saved Newsletter Archive' : 'Autonomous Newsletter Workspace'}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {selectedSavedName 
                  ? `Viewing file: ${selectedSavedName}` 
                  : 'Enter a topic to dispatch the agent on web search, article scraping, and copy refinement.'}
              </p>
            </div>
            
            {/* Quick stats / metadata */}
            {selectedSavedName && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadNewsletterLocally}
                  className="bg-indigo-650 hover:bg-indigo-600 text-white py-2 px-4 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg shadow-indigo-650/15 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download HTML File</span>
                </button>
              </div>
            )}
          </div>

          {/* MAIN PAGE RENDER */}
          {!selectedSavedName && !newsletter && !loading ? (
            
            /* COMPONENT 1: SETUP FORM */
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full my-auto">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="text-center mb-8">
                <div className="bg-slate-900 border border-slate-800 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-md">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold">What newsletter would you like to build?</h3>
                <p className="text-sm text-slate-400 mt-1">Our agent will query Google, scrape top articles, summarize topics, and design a custom newsletter.</p>
              </div>

              <form onSubmit={handleGenerate} className="space-y-6">
                <div>
                  <label htmlFor="goal" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Plain-English Goal
                  </label>
                  <textarea
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. Create a weekly newsletter on the latest AI agent news and breakthroughs in mid-2026..."
                    className="w-full h-32 bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setMode('auto')}
                    className={`p-4 rounded-xl border text-left transition-all relative ${
                      mode === 'auto'
                        ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/5 text-white'
                        : 'bg-slate-900/20 border-slate-800/80 hover:bg-slate-900/40 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${mode === 'auto' ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                      <span className="font-bold text-sm">Fully Autonomous</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Agent finishes all steps including saving output without interruption.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('hitl')}
                    className={`p-4 rounded-xl border text-left transition-all relative ${
                      mode === 'hitl'
                        ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/5 text-white'
                        : 'bg-slate-900/20 border-slate-800/80 hover:bg-slate-900/40 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${mode === 'hitl' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className="font-bold text-sm">Human-in-the-Loop</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Agent generates draft, critiques it, then pauses for your final approval.</p>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!goal.trim()}
                  className="w-full bg-gradient-to-r from-indigo-650 to-violet-650 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center space-x-2 shadow-lg shadow-indigo-950/20 transition-all duration-300"
                >
                  <Play className="w-5 h-5 fill-white/20" />
                  <span>Generate Newsletter</span>
                </button>
              </form>
            </div>

          ) : loading || (newsletter && steps.some(s => s.status === 'running')) ? (
            
            /* COMPONENT 2: PROGRESS LOG & TRACKER */
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-8 flex-1 max-w-2xl mx-auto w-full my-auto">
              <div className="text-center">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" />
                <h3 className="text-xl font-bold">Agent Pipeline Active</h3>
                <p className="text-sm text-slate-400 mt-1">Executing multi-step reasoning models on Groq.</p>
              </div>

              {/* Steps Progress List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {steps.map((step, idx) => {
                  const statusLabel = step.status.charAt(0).toUpperCase() + step.status.slice(1);
                  return (
                    <div 
                      key={step.name}
                      className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-300 ${getStepClass(step.status)}`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-900 border border-slate-800 w-6 h-6 rounded-full flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-sm text-slate-200">{step.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{statusLabel}</p>
                        </div>
                      </div>
                      <div>{getStepIcon(step.status)}</div>
                    </div>
                  );
                })}
              </div>

              {/* Status Details logs */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Agent Logs</span>
                </div>
                <div className="font-mono text-xs text-indigo-300/90 break-words leading-relaxed">
                  {statusDetail}
                </div>
              </div>
            </div>

          ) : newsletter ? (
            
            /* COMPONENT 3: COMPLETED WORKSPACE VIEW */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Left 2 Columns: Newsletter Preview */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* HITL Pending Banner */}
                {newsletter.awaiting_approval && newsletter.session_id && (
                  <div className="bg-amber-950/80 border border-amber-800 rounded-2xl p-6 flex flex-col md:flex-row items-center md:items-start justify-between gap-4 shadow-xl">
                    <div className="flex items-center md:items-start space-x-4">
                      <div className="bg-amber-500/10 p-3 rounded-xl text-amber-400">
                        <UserCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-200">Human Approval Pending</h4>
                        <p className="text-xs text-amber-400/90 mt-0.5 leading-relaxed">
                          The agent has prepared the design and critiqued the draft. Approve the content below to finalize the newsletter and write it to the server filesystem.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleApprove}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 px-6 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/10 flex items-center space-x-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Check className="w-4 h-4 stroke-[3px]" />
                      <span>Approve & Save</span>
                    </button>
                  </div>
                )}

                {/* Newsletter Card Preview */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500" />
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-xs text-slate-400 font-semibold truncate max-w-md">
                      Subject: {newsletter.subject}
                    </span>
                    <button
                      onClick={downloadNewsletterLocally}
                      className="bg-indigo-650 hover:bg-indigo-600 text-white p-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all"
                      title="Download HTML locally"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  </div>
                  
                  {/* HTML Content Card (dangerouslySetInnerHTML) */}
                  <div className="bg-white p-8 max-h-[700px] overflow-y-auto">
                    <div 
                      dangerouslySetInnerHTML={{ __html: newsletter.html }} 
                      className="newsletter-preview-box"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Article summaries and stats */}
              <div className="space-y-6">
                
                {/* Generated files info */}
                {newsletter.filename && (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <h4 className="font-bold text-sm text-slate-300">File Output Saved</h4>
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-400 space-y-2">
                      <div className="flex justify-between">
                        <span>Filename:</span>
                        <span className="text-indigo-400 truncate max-w-[150px]">{newsletter.filename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Directory:</span>
                        <span className="text-slate-500">output/</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scraped articles card list */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-300 flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span>Scraped Sources</span>
                    </h4>
                    <span className="bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full text-xs font-bold">
                      {newsletter.articles ? newsletter.articles.length : 0}
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {newsletter.articles && newsletter.articles.map((art, idx) => (
                      <div 
                        key={idx} 
                        className="bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/60 p-4 rounded-xl space-y-2 transition-all group"
                      >
                        <h5 className="font-bold text-xs text-slate-200 group-hover:text-indigo-400 transition-colors line-clamp-2">
                          {art.title}
                        </h5>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {art.summary}
                        </p>
                        <a 
                          href={art.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center space-x-1 mt-1"
                        >
                          <span>Visit Source Link</span>
                          <ArrowRight className="w-2.5 h-2.5 transform group-hover:translate-x-0.5 transition-transform" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flow Completion steps summary */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <h4 className="font-bold text-sm text-slate-300">Pipeline Completion</h4>
                  <div className="space-y-2">
                    {steps.map((s) => (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{s.name}</span>
                        <div className="flex items-center space-x-1.5 font-semibold">
                          {s.status === 'done' && <span className="text-emerald-500 flex items-center space-x-1"><Check className="w-3 h-3" /> Done</span>}
                          {s.status === 'running' && <span className="text-indigo-400 flex items-center space-x-1 animate-pulse">Running</span>}
                          {s.status === 'paused' && <span className="text-amber-500">Paused</span>}
                          {s.status === 'error' && <span className="text-rose-500">Error</span>}
                          {s.status === 'pending' && <span className="text-slate-600">Pending</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          ) : (
            
            /* COMPONENT 4: ARCHIVE / SAVED VIEW */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Left 2 Columns: Saved HTML Content */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500" />
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-xs text-slate-400 font-semibold truncate max-w-md">
                      Archive: {selectedSavedName}
                    </span>
                    <button
                      onClick={downloadNewsletterLocally}
                      className="bg-indigo-650 hover:bg-indigo-600 text-white p-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                  
                  {/* HTML Content Card (dangerouslySetInnerHTML) */}
                  <div className="bg-white p-8 max-h-[750px] overflow-y-auto">
                    {loadingSaved ? (
                      <div className="py-20 text-center text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
                        <p className="text-sm">Loading archive content...</p>
                      </div>
                    ) : (
                      <div 
                        dangerouslySetInnerHTML={{ __html: selectedSavedHtml }} 
                        className="newsletter-preview-box"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Metadata details for saved file */}
              <div className="space-y-6">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <h4 className="font-bold text-sm text-slate-300">Archive Details</h4>
                  
                  {savedList.find(s => s.filename === selectedSavedName) && (
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-400 space-y-3">
                      <div className="flex justify-between">
                        <span>Filename:</span>
                        <span className="text-indigo-400 truncate max-w-[150px]" title={selectedSavedName}>
                          {selectedSavedName}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Saved Date:</span>
                        <span className="text-slate-350">
                          {new Date(savedList.find(s => s.filename === selectedSavedName).created_at * 1000).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>File Size:</span>
                        <span className="text-slate-350">
                          {(savedList.find(s => s.filename === selectedSavedName).size_bytes / 1024).toFixed(2)} KB
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setNewsletter(null);
                      setSelectedSavedName('');
                      setSelectedSavedHtml('');
                    }}
                    className="w-full bg-indigo-650 hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-indigo-650/15 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Create a New Newsletter</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

    </div>
  );
}

export default App;
