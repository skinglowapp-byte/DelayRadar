import type { AppBootstrap } from "@/src/lib/data/types";
import { cn } from "@/src/lib/utils";

import { toneClass } from "./helpers";

export function ActivityPanel({
  timeline,
  assumptions,
}: {
  timeline: AppBootstrap["timeline"];
  assumptions: string[];
}) {
  return (
    <>
      <div>
        <span className="eyebrow">Recent activity</span>
        <h2 className="section-title">Processing timeline</h2>
      </div>
      <div className="timeline">
        {timeline.map((item) => (
          <div className="timeline-item" key={item.id}>
            <span className="timeline-mark" />
            <div className="timeline-body">
              <div className={cn("pill", toneClass(item.tone))}>
                {item.occurredAt}
              </div>
              <strong>{item.title}</strong>
              <span className="microcopy">{item.body}</span>
            </div>
          </div>
        ))}
      </div>
      <div>
        <span className="eyebrow">Assumptions</span>
        <div className="timeline">
          {assumptions.map((item) => (
            <div className="timeline-item" key={item}>
              <span className="timeline-mark" />
              <div className="timeline-body">
                <span className="microcopy">{item}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
