"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import type { SourceClaim } from "../lib/transparency";

function label(value: string) {
  return value.replaceAll("_", " ").replaceAll(/([a-z])([A-Z])/g, "$1 $2");
}

export function SourceRegistry({ claims }: { claims: SourceClaim[] }) {
  const searchParams = useSearchParams();
  const [project, setProject] = useState(
    () => searchParams.get("project") ?? "all",
  );
  const [field, setField] = useState("all");
  const [sourceType, setSourceType] = useState("all");

  const options = useMemo(
    () => ({
      projects: [
        ...new Map(
          claims.map((claim) => [claim.projectSlug, claim.projectName]),
        ).entries(),
      ],
      fields: [...new Set(claims.map((claim) => claim.field))].sort(),
      types: [
        ...new Set(claims.map((claim) => claim.source.sourceType)),
      ].sort(),
    }),
    [claims],
  );
  const visible = claims.filter(
    (claim) =>
      (project === "all" || claim.projectSlug === project) &&
      (field === "all" || claim.field === field) &&
      (sourceType === "all" || claim.source.sourceType === sourceType),
  );

  return (
    <>
      <div className="filters source-filters">
        <label>
          Project
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            <option value="all">All projects</option>
            {options.projects.map(([slug, name]) => (
              <option value={slug} key={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Claim
          <select
            value={field}
            onChange={(event) => setField(event.target.value)}
          >
            <option value="all">All claims</option>
            {options.fields.map((item) => (
              <option value={item} key={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source type
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value)}
          >
            <option value="all">All source types</option>
            {options.types.map((item) => (
              <option value={item} key={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="registry-count">
        Showing {visible.length} of {claims.length} claim-source links.
      </p>
      <div className="table-shell evidence-shell">
        <table className="evidence-table source-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Record</th>
              <th>Claim</th>
              <th>Support</th>
              <th>Source</th>
              <th>Accessed</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((claim) => (
              <tr key={claim.id}>
                <td>
                  <Link href={`/project/${claim.projectSlug}/`}>
                    {claim.projectName}
                  </Link>
                </td>
                <td>
                  {label(claim.recordType)}
                  <small>{claim.recordId}</small>
                </td>
                <td>
                  <code>{claim.field}</code>
                </td>
                <td>{claim.supportType}</td>
                <td>
                  <a href={claim.source.url} rel="noreferrer" target="_blank">
                    {claim.source.title}
                  </a>
                  <small>
                    {claim.source.publisher} · {label(claim.source.sourceType)}
                    <br />
                    {claim.source.description}
                  </small>
                </td>
                <td>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                  }).format(new Date(claim.source.accessedAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
