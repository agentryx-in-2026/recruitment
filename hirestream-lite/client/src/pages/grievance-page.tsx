import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Plus, Clock, CheckCircle, AlertCircle, Loader2, Inbox, ShieldCheck, Mic } from "lucide-react";
import { GrievanceThread } from "@/components/shared/GrievanceThread";
import { FIELD_LIMITS } from "@/lib/reference-data";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

async function fetchJson(url: string) {
  const res = await fetch(url);
  // audit 2026-07-06 (C7): throw on non-OK so React Query enters its error
  // state — with staleTime Infinity + retry false, a swallowed 500 used to
  // render as a permanently empty list.
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}


export default function GrievancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const { t, i18n } = useTranslation();

  // UAT-03 #17: the dashboard's "Report a fraud agent" / "someone asked for
  // money" link deep-links here with ?type=fraud — open the form pre-set.
  useEffect(() => {
    const type = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("type") : null;
    if (type === "fraud") { setCategory("fraud_report"); setShowForm(true); }
  }, []);

  // UAT-03 #17: voice input for the description (blue-collar / low-literacy).
  // Web Speech API, Hindi-aware; appends the transcript. Hidden if unsupported.
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const speechSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { try { recogRef.current?.stop(); } catch {} setListening(false); return; }
    const r = new SR();
    r.lang = i18n.language === "hi" ? "hi-IN" : "en-IN";
    r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => { const said = e.results?.[0]?.[0]?.transcript?.trim(); if (said) setDescription((d) => (d ? `${d} ${said}` : said).slice(0, FIELD_LIMITS.grievanceBody)); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  // The page used to call /grievances/my for everyone — which meant agents
  // and admins (who don't normally submit grievances) saw an empty page even
  // when they had work assigned to them. v0.4.9.0: role-aware tabs.
  //   - everyone:                "My Grievances"          (/grievances/my)
  //   - any role:                "Assigned to me"         (/grievances/assigned-to-me)
  //   - admin / superadmin only: "All grievances"         (/grievances)
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const TAB_MY = "mine";
  const TAB_ASSIGNED = "assigned";
  const TAB_ALL = "all";
  const [tab, setTab] = useState<string>(isAdmin ? TAB_ALL : TAB_MY);

  const { data: myRes, isLoading: myLoading, isError: myError, refetch: refetchMy } = useQuery({
    queryKey: ["/api/v1/grievances/my"],
    queryFn: () => fetchJson("/api/v1/grievances/my"),
  });
  const { data: assignedRes, isLoading: assignedLoading, isError: assignedError, refetch: refetchAssigned } = useQuery({
    queryKey: ["/api/v1/grievances/assigned-to-me"],
    queryFn: () => fetchJson("/api/v1/grievances/assigned-to-me"),
    enabled: !!user,   // any logged-in role can have things assigned
  });
  const { data: allRes, isLoading: allLoading, isError: allError, refetch: refetchAll } = useQuery({
    queryKey: ["/api/v1/grievances"],
    queryFn: () => fetchJson("/api/v1/grievances"),
    enabled: isAdmin,  // god-view only fetched for admins
  });

  const myList = myRes?.data || [];
  const assignedList = assignedRes?.data || [];
  const allList = allRes?.data || [];

  const active =
    tab === TAB_ASSIGNED ? assignedList :
    tab === TAB_ALL ? allList :
    myList;
  const isLoading =
    tab === TAB_ASSIGNED ? assignedLoading :
    tab === TAB_ALL ? allLoading :
    myLoading;
  // audit 2026-07-06 (C7): active tab's error state + retry handle
  const isError =
    tab === TAB_ASSIGNED ? assignedError :
    tab === TAB_ALL ? allError :
    myError;
  const refetchActive =
    tab === TAB_ASSIGNED ? refetchAssigned :
    tab === TAB_ALL ? refetchAll :
    refetchMy;

  // Status-update mutation — visible only on the assigned-to-me tab so an
  // owner (agent / Agentryx delivery / admin) can move a grievance through
  // the lifecycle from this page instead of hopping to the admin panel.
  const updateStatus = useMutation({
    mutationFn: async ({ id, status, resolutionNotes }: any) => {
      const body: any = { status };
      if (resolutionNotes) body.resolutionNotes = resolutionNotes;
      const r = await fetch(`/api/v1/grievances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error?.message || e?.message || `Update failed (${r.status})`);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/grievances/assigned-to-me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/grievances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/grievances/my"] });
      toast({ title: t("grievance.updatedToast") });
    },
    onError: (e: any) => toast({ title: t("grievance.couldNotUpdate"), description: e.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/v1/grievances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("grievance.submittedToast"), description: t("grievance.submittedToastDesc") });
      setShowForm(false);
      setCategory("");
      setSubject("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/grievances/my"] });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const grievances = active;

  const statusIcon = (status: string) => {
    switch (status) {
      case "submitted": return <Clock className="w-4 h-4 text-amber-500" />;
      case "under_review": return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case "resolved": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "submitted": return "bg-amber-100 text-amber-700";
      case "under_review": return "bg-blue-100 text-blue-700";
      case "action_taken": return "bg-purple-100 text-purple-700";
      case "resolved": return "bg-emerald-100 text-emerald-700";
      case "escalated": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">{t("grievance.pleaseSignIn")}</h2>
        <p className="text-gray-500 mt-2">{t("grievance.signInGate")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("grievance.title")}</h1>
          <p className="text-gray-500 text-sm mt-1">{t("grievance.subtitle")}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white">
          <Plus className="w-4 h-4 mr-1" /> {t("grievance.newGrievance")}
        </Button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          {/* audit 2026-07-06 (Batch 3): wired remaining hardcoded strings to grievance.* */}
          <h3 className="text-lg font-semibold mb-4">{t("grievance.submitGrievance")}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("grievance.category")}</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={t("grievance.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraud_report">{t("grievance.fraudReport")}</SelectItem>
                  <SelectItem value="workplace_abuse">{t("grievance.workplaceAbuse")}</SelectItem>
                  <SelectItem value="recruitment_problem">{t("grievance.recruitmentProblem")}</SelectItem>
                  <SelectItem value="application_issue">{t("grievance.applicationIssue")}</SelectItem>
                  <SelectItem value="technical_problem">{t("grievance.technicalProblem")}</SelectItem>
                  <SelectItem value="policy_inquiry">{t("grievance.policyInquiry")}</SelectItem>
                  <SelectItem value="other">{t("grievance.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("grievance.subject")}</label>
              <Input placeholder={t("grievance.subjectPlaceholder")} value={subject}
                maxLength={FIELD_LIMITS.grievanceSubject}
                onChange={(e) => setSubject(e.target.value)} />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{subject.length} / {FIELD_LIMITS.grievanceSubject}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("grievance.description")}</label>
              <div className="relative">
                <textarea
                  className={`w-full min-h-[120px] p-3 ${speechSupported ? "pr-14" : ""} border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder={t("grievance.descPlaceholder")}
                  value={description}
                  maxLength={FIELD_LIMITS.grievanceBody}
                  onChange={(e) => setDescription(e.target.value)}
                />
                {speechSupported && (
                  <button type="button" onClick={toggleVoice} title={listening ? t("shell.voiceListening") : t("shell.voiceTap")} aria-label={listening ? t("shell.voiceListening") : t("shell.voiceTap")}
                    className={`absolute right-2 top-2 w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-md transition-all ${listening ? "bg-gradient-to-br from-rose-500 to-red-600 animate-pulse" : "bg-gradient-to-br from-blue-500 to-blue-600"}`}>
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{description.length} / {FIELD_LIMITS.grievanceBody}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => submitMutation.mutate({ category, subject, description })}
                disabled={!category || !subject || !description || submitMutation.isPending}
                className="bg-blue-600 text-white"
              >
                {submitMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t("grievance.submitting")}</> : t("grievance.submit")}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>{t("grievance.cancel")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab strip — only show tabs the user can use. Candidates with no
       *  assigned items get the "My" tab only; agents/admins get the
       *  full set. Counts give a quick at-a-glance feel for queue size. */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        <button
          onClick={() => setTab(TAB_MY)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === TAB_MY ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <Inbox className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t("grievance.tabMy")}
          <span className="ml-2 text-xs text-slate-400">({myList.length})</span>
        </button>
        {assignedList.length > 0 && (
          <button
            onClick={() => setTab(TAB_ASSIGNED)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === TAB_ASSIGNED ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            <MessageSquare className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {t("grievance.tabAssigned")}
            <span className="ml-2 text-xs text-amber-600 font-semibold">({assignedList.length})</span>
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setTab(TAB_ALL)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === TAB_ALL ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            <ShieldCheck className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {t("grievance.tabAll")}
            <span className="ml-2 text-xs text-slate-400">({allList.length})</span>
          </button>
        )}
      </div>

      {/* Grievance List */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : isError ? (
        /* audit 2026-07-06 (C7): show a retry affordance instead of a false "no grievances" */
        <div className="text-center py-16 text-gray-500 bg-white rounded-lg shadow-sm">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-30 text-red-400" />
          <p className="text-lg font-medium">{t("grievance.couldNotLoad")}</p>
          <Button variant="outline" className="mt-4" onClick={() => refetchActive()}>{t("common.retry")}</Button>
        </div>
      ) : grievances.length === 0 ? (
        <div className="text-center py-16 text-gray-500 bg-white rounded-lg shadow-sm">
          <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">
            {tab === TAB_ASSIGNED ? t("grievance.nothingAssigned")
              : tab === TAB_ALL ? t("grievance.noneInSystem")
              : t("grievance.noGrievances")}
          </p>
          <p className="text-sm mt-1">
            {tab === TAB_MY ? t("grievance.noGrievancesDesc") :
             tab === TAB_ASSIGNED ? t("grievance.assignedEmptyDesc") :
             t("grievance.allEmptyDesc")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grievances.map((g: any) => {
            // I'm the owner of this row if my user.id matches assigned_to.
            // Owner sees inline status-change actions; non-owners just read.
            // (Admin/superadmin always sees actions via the All tab anyway,
            //  since they have full PATCH rights.)
            const iAmOwner = !!user && g.assignedTo === user.id;
            const iAmComplainant = !!user && g.userId === user.id;
            const isTerminal = g.status === "resolved" || g.status === "escalated";
            const canAct = (iAmOwner || isAdmin) && !iAmComplainant && !isTerminal;
            return (
              <div key={g.id} className="bg-white rounded-lg shadow-sm border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {statusIcon(g.status)}
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-gray-900">{g.subject}</h4>
                      <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{g.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs capitalize">{g.category?.replace(/_/g, ' ')}</Badge>
                        <Badge className={`text-xs ${statusColor(g.status)}`}>{g.status?.replace(/_/g, ' ')}</Badge>
                        <span className="text-xs text-gray-400">{g.createdAt ? new Date(g.createdAt).toLocaleDateString('en-IN') : ''}</span>
                        {/* Show submitter + owner on the admin/assigned tabs so the operator
                         *  can see who's complaining and who's responsible without clicking in. */}
                        {tab !== TAB_MY && g.submitter && (
                          <span className="text-[11px] text-slate-500">
                            from <span className="font-semibold">{g.submitter.username}</span> ({g.submitter.role})
                          </span>
                        )}
                        {tab !== TAB_MY && (g.owner ? (
                          <span className="text-[11px] text-indigo-600">
                            → <span className="font-semibold">{g.owner.username}</span> ({g.owner.role})
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600">→ admin queue</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Staff drive the work — Start Review → Action Taken, then wait. */}
                  {canAct && (
                    <div className="flex flex-col gap-1 shrink-0">
                      {g.status === "submitted" && (
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: g.id, status: "under_review" })}>
                          {t("grievance.startReview")}
                        </Button>
                      )}
                      {g.status === "under_review" && (
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          disabled={updateStatus.isPending}
                          onClick={() => {
                            const note = window.prompt(t("grievance.actionPrompt"), "");
                            if (note !== null) updateStatus.mutate({ id: g.id, status: "action_taken", resolutionNotes: note.trim() || undefined });
                          }}>
                          {t("grievance.markActionTaken")}
                        </Button>
                      )}
                      {g.status === "action_taken" && (
                        <span className="text-[11px] text-amber-600 font-medium max-w-[140px] text-right">{t("grievance.awaitingConfirmation")}</span>
                      )}
                    </div>
                  )}
                  {/* The COMPLAINANT closes the loop — confirm resolved, reopen, or
                      simply close/withdraw their own grievance at any stage. */}
                  {iAmComplainant && !isTerminal && (
                    <div className="flex flex-col gap-1 shrink-0">
                      {g.status === "action_taken" ? (
                        <>
                          <Button size="sm" className="bg-emerald-600 text-white text-xs h-7"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: g.id, status: "resolved" })}>
                            {t("grievance.markResolved")}
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: g.id, status: "under_review" })}>
                            {t("grievance.reopen")}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          disabled={updateStatus.isPending}
                          onClick={() => { if (window.confirm(t("grievance.closeConfirm"))) updateStatus.mutate({ id: g.id, status: "resolved" }); }}>
                          {t("grievance.closeGrievance")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {g.resolutionNotes && (
                  <div className="mt-3 bg-emerald-50 border border-emerald-200 p-3 rounded text-sm">
                    <p className="font-medium text-emerald-800">{t("grievance.resolutionLabel")}:</p>
                    <p className="text-emerald-700 mt-1 whitespace-pre-wrap">{g.resolutionNotes}</p>
                  </div>
                )}
                {g.adminNotes && !g.resolutionNotes && tab !== TAB_MY && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 p-3 rounded text-sm">
                    <p className="font-medium text-blue-800">{t("grievance.internalNote")}:</p>
                    <p className="text-blue-700 mt-1">{g.adminNotes}</p>
                  </div>
                )}
                <GrievanceThread grievanceId={g.id} isStaff={iAmOwner || isAdmin} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
