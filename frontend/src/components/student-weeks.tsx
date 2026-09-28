"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Clock3, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { courseWeeks, progressLabels, type CourseProgress, type WeekProgress } from "@/lib/course-weeks";

function StatusBadge({ progress }: { progress?: WeekProgress }) {
  return <Badge variant="outline" className="student-week-status" data-status={progress?.status}>
    {progress?.status === "completed" ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
    {progress ? progressLabels[progress.status] : "Status unavailable"}
  </Badge>;
}

export function StudentWeeks() {
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const previousSelection = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/student/progress", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (response.status === 401) { window.location.replace("/student/login"); return; }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to load progress.");
        if (!controller.signal.aborted) { setProgress(body); setError(""); }
      } catch (failure) {
        if (!controller.signal.aborted) { setProgress(null); setError(failure instanceof Error ? failure.message : "Unable to load progress."); }
      } finally {
        fetching = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [revision]);

  useEffect(() => {
    if (selected !== null) {
      detailRef.current?.focus();
      previousSelection.current = selected;
    } else if (previousSelection.current !== null) {
      buttonsRef.current[previousSelection.current]?.focus();
    }
  }, [selected]);

  const completed = progress?.weeks.filter(week => week.status === "completed").length ?? 0;
  const week = selected !== null ? courseWeeks[selected] : null;
  const current = progress?.weeks.find(item => item.week === (selected ?? 0) + 1);

  return <div className="student-week-programme">
    <div className="student-week-summary">
      <h2>Weekly learning</h2>
      {progress && <span>{completed} of 4 weeks completed</span>}
    </div>
    {progress && <progress className="student-course-progress" value={completed} max={4} aria-label={`${completed} of 4 weeks completed`} />}
    {loading && <p role="status">Loading progress...</p>}
    {error && <div className="student-week-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => { setLoading(true); setRevision(value => value + 1); }}><RefreshCw />Retry</Button></div>}
    {week && selected !== null ? <section ref={detailRef} tabIndex={-1} className="student-week-detail" aria-labelledby="week-detail-title">
      <Button variant="outline" onClick={() => setSelected(null)}><ArrowLeft />All weeks</Button>
      <div className="student-week-detail-heading"><span className="student-week-number">Week {String(selected + 1).padStart(2, "0")}</span><StatusBadge progress={current} /></div>
      <h2 id="week-detail-title">{week.title}</h2>
      <p>{week.description}</p>
      <div className="student-course-facts"><span><BookOpen size={16} />2 sessions</span><span><Clock3 size={16} />2 hours per session</span></div>
      {current?.updated_at && <p className="student-week-updated">Progress updated by admin: {new Date(current.updated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
      <section><h3>Learning outcomes</h3><ul>{week.outcomes.map(outcome => <li key={outcome}>{outcome}</li>)}</ul></section>
      <section><h3>Sessions</h3>{week.sessions.map((session, index) => <article key={session.title} className="student-week-session">
        <div className="student-week-session-meta"><span>Session {selected * 2 + index + 1}</span><span>{session.format}</span></div>
        <h4>{session.title}</h4>
        <dl><div><dt>Concepts</dt><dd>{session.theory}</dd></div><div><dt>Practical</dt><dd>{session.practical}</dd></div><div><dt>Expected output</dt><dd>{session.output}</dd></div></dl>
        <p className="student-week-timing">{session.timing}</p>
      </article>)}</section>
      <section><h3>Practice tasks</h3><ol>{week.tasks.map(task => <li key={task}>{task}</li>)}</ol></section>
      <section><h3>Week deliverables</h3><ul>{week.deliverables.map(item => <li key={item}>{item}</li>)}</ul></section>
      <section><h3>Course materials</h3><ul>{week.materials.map(item => <li key={item}>{item}</li>)}</ul><p>Downloadable files have not been published yet.</p></section>
      <div className="student-week-detail-nav"><Button variant="outline" disabled={selected === 0} onClick={() => setSelected(selected - 1)}><ArrowLeft />Previous week</Button><Button variant="outline" disabled={selected === 3} onClick={() => setSelected(selected + 1)}>Next week<ArrowRight /></Button></div>
    </section> : <div className="student-weeks-grid">
      {courseWeeks.map((item, index) => <Card key={item.title} className="student-week-card">
        <CardHeader>
          <div className="student-week-card-meta"><span className="student-week-number">Week {String(index + 1).padStart(2, "0")}</span>{loading && !progress ? <Badge variant="outline">Loading...</Badge> : <StatusBadge progress={progress?.weeks.find(entry => entry.week === index + 1)} />}</div>
          <CardTitle><h3>{item.title}</h3></CardTitle>
        </CardHeader>
        <CardContent><p>{item.description}</p><div className="student-topic-badges">{item.topics.map(topic => <Badge key={topic} variant="outline">{topic}</Badge>)}</div><ul className="student-week-deliverables">{item.deliverables.map(deliverable => <li key={deliverable}>{deliverable}</li>)}</ul></CardContent>
        <CardFooter><span>2 sessions / 4 hours</span><Button ref={node => { buttonsRef.current[index] = node; }} className="student-week-open" variant="ghost" aria-label={`Open Week ${index + 1}: ${item.title}`} onClick={() => setSelected(index)}>View week<ArrowUpRight /></Button></CardFooter>
      </Card>)}
    </div>}
  </div>;
}