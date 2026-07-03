#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ticketsDir = path.join(repoRoot, "tickets");
const boardPath = path.join(ticketsDir, "BOARD.md");

const statusOrder = ["Ready", "In Progress", "Review", "Blocked", "Done", "Archived"];
const metadataOrder = [
  "id",
  "title",
  "status",
  "owner_thread",
  "priority",
  "area",
  "created",
  "updated",
  "depends_on",
  "related_files",
];

function main() {
  ensureTicketsDir();

  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "board" || command === "update") {
    rebuildBoard();
    return;
  }

  if (command === "new") {
    createTicket(parseOptions(args));
    rebuildBoard();
    return;
  }

  if (command === "status") {
    const [ticketId, ...statusParts] = args;
    updateTicketField(ticketId, "status", statusParts.join(" ").trim());
    rebuildBoard();
    return;
  }

  if (command === "assign") {
    const [ticketId, ...ownerParts] = args;
    updateTicketField(ticketId, "owner_thread", ownerParts.join(" ").trim());
    rebuildBoard();
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function ensureTicketsDir() {
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }
}

function parseOptions(args) {
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2).replaceAll("-", "_");
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return options;
}

function createTicket(options) {
  const title = options.title?.trim();
  if (!title) {
    throw new Error('Missing required option: --title "Ticket title"');
  }

  const id = options.id?.trim() || nextTicketId();
  if (!/^BK-\d{4}$/.test(id)) {
    throw new Error(`Ticket id must match BK-0000 format: ${id}`);
  }

  const fileName = `${id}-${slugify(title)}.md`;
  const filePath = path.join(ticketsDir, fileName);
  if (fs.existsSync(filePath)) {
    throw new Error(`Ticket already exists: ${path.relative(repoRoot, filePath)}`);
  }

  const today = localDate();
  const metadata = {
    id,
    title,
    status: normalizeStatus(options.status || "Ready"),
    owner_thread: options.owner || options.owner_thread || "Unassigned",
    priority: options.priority || "P2",
    area: options.area || "Unscoped",
    created: today,
    updated: today,
    depends_on: options.depends_on || "",
    related_files: options.related_files || "",
  };

  const body = `# ${id} ${title}

${serializeFrontmatter(metadata)}

## Goal

Pending.

## Scope

- Pending.

## Out Of Scope

- Pending.

## Expected Files

- Pending.

## Validation

- Pending.

## Done Criteria

- [ ] Scope report was provided before work started.
- [ ] Implementation stays within this ticket.
- [ ] Validation commands passed or failures are reported.
- [ ] Only ticket-scope files were staged with explicit pathspecs.
- [ ] Commit was created, unless an AGENTS.md exception applies.
- [ ] \`tickets/BOARD.md\` was regenerated.
- [ ] Ticket result includes verification summary.
- [ ] Final response reports commit hash.

## Result

Pending.

## Notes

- Created by \`scripts/update-ticket-board.mjs new\`.
`;

  fs.writeFileSync(filePath, body, "utf8");
  console.log(`Created ${path.relative(repoRoot, filePath)}`);
}

function updateTicketField(ticketId, field, value) {
  if (!ticketId) {
    throw new Error("Missing ticket id");
  }

  const cleanValue = value?.trim();
  if (!cleanValue) {
    throw new Error(`Missing value for ${field}`);
  }

  const ticket = findTicket(ticketId);
  const nextValue = field === "status" ? normalizeStatus(cleanValue) : cleanValue;
  const nextMetadata = {
    ...ticket.metadata,
    [field]: nextValue,
    updated: localDate(),
  };

  const nextText = ticket.text.replace(ticket.frontmatterBlock, serializeFrontmatter(nextMetadata).trimEnd());
  fs.writeFileSync(ticket.filePath, nextText, "utf8");
  console.log(`Updated ${ticket.metadata.id} ${field} -> ${nextValue}`);
}

function findTicket(ticketId) {
  const normalizedId = ticketId.toUpperCase();
  const tickets = readTickets();
  const ticket = tickets.find((item) => item.metadata.id?.toUpperCase() === normalizedId);
  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  return ticket;
}

function nextTicketId() {
  const tickets = readTickets();
  const maxNumber = tickets.reduce((max, ticket) => {
    const match = ticket.metadata.id?.match(/^BK-(\d{4})$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `BK-${String(maxNumber + 1).padStart(4, "0")}`;
}

function rebuildBoard() {
  const tickets = readTickets().sort(compareTickets);
  const now = localDate();
  const counts = new Map(statusOrder.map((status) => [status, 0]));

  for (const ticket of tickets) {
    const status = ticket.metadata.status || "Ready";
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  const lines = [
    "# Ticket Board",
    "",
    "<!-- Managed by scripts/update-ticket-board.mjs. Edit ticket files, then regenerate this board. -->",
    "",
    `Last updated: ${now}`,
    "",
    "## Summary",
    "",
    "| Status | Count |",
    "| --- | ---: |",
  ];

  for (const status of statusOrder) {
    lines.push(`| ${status} | ${counts.get(status) || 0} |`);
  }

  const activeTickets = tickets.filter((ticket) => !["Done", "Archived"].includes(ticket.metadata.status));

  lines.push(
    "",
    "## Active Tickets",
    "",
    ticketTable(activeTickets),
    "",
    "## By Status",
    "",
  );

  for (const status of statusOrder) {
    const group = tickets.filter((ticket) => ticket.metadata.status === status);
    lines.push(`### ${status}`, "", ticketTable(group), "");
  }

  fs.writeFileSync(boardPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
  console.log(`Updated ${path.relative(repoRoot, boardPath)} (${tickets.length} ticket${tickets.length === 1 ? "" : "s"})`);
}

function readTickets() {
  if (!fs.existsSync(ticketsDir)) {
    return [];
  }

  return fs
    .readdirSync(ticketsDir)
    .filter((fileName) => /^BK-\d{4}-.+\.md$/.test(fileName))
    .map((fileName) => readTicket(path.join(ticketsDir, fileName)));
}

function readTicket(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/m);
  if (!match) {
    throw new Error(`Missing frontmatter: ${path.relative(repoRoot, filePath)}`);
  }

  return {
    filePath,
    text,
    frontmatterBlock: match[0],
    metadata: parseFrontmatter(match[1]),
  };
}

function parseFrontmatter(frontmatter) {
  const metadata = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    metadata[key] = value;
  }

  if (metadata.status) {
    metadata.status = normalizeStatus(metadata.status);
  }

  return metadata;
}

function serializeFrontmatter(metadata) {
  const orderedKeys = [
    ...metadataOrder,
    ...Object.keys(metadata).filter((key) => !metadataOrder.includes(key)).sort(),
  ];

  const lines = ["---"];
  for (const key of orderedKeys) {
    if (!Object.hasOwn(metadata, key)) {
      continue;
    }
    lines.push(`${key}: ${metadata[key] ?? ""}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function normalizeStatus(status) {
  const match = statusOrder.find((candidate) => candidate.toLowerCase() === status.toLowerCase());
  if (!match) {
    throw new Error(`Invalid status "${status}". Use one of: ${statusOrder.join(", ")}`);
  }

  return match;
}

function compareTickets(left, right) {
  const leftStatus = statusOrder.indexOf(left.metadata.status);
  const rightStatus = statusOrder.indexOf(right.metadata.status);
  const statusDiff = normalizeOrder(leftStatus) - normalizeOrder(rightStatus);
  if (statusDiff !== 0) {
    return statusDiff;
  }

  const priorityDiff = priorityRank(left.metadata.priority) - priorityRank(right.metadata.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return (left.metadata.id || "").localeCompare(right.metadata.id || "");
}

function normalizeOrder(index) {
  return index === -1 ? statusOrder.length : index;
}

function priorityRank(priority) {
  const match = String(priority || "").match(/^P(\d+)$/i);
  return match ? Number(match[1]) : 99;
}

function ticketTable(tickets) {
  if (tickets.length === 0) {
    return "_None._";
  }

  const lines = [
    "| ID | Title | Owner | Priority | Area | Updated | File |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const ticket of tickets) {
    const fileName = path.basename(ticket.filePath);
    const relativeFile = `./${fileName}`;
    lines.push(
      [
        markdownCell(ticket.metadata.id),
        markdownCell(ticket.metadata.title),
        markdownCell(ticket.metadata.owner_thread),
        markdownCell(ticket.metadata.priority),
        markdownCell(ticket.metadata.area),
        markdownCell(ticket.metadata.updated),
        `[${markdownCell(fileName)}](${relativeFile})`,
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  return lines.join("\n");
}

function markdownCell(value) {
  return String(value || "").replaceAll("|", "\\|");
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "ticket";
}

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/update-ticket-board.mjs
  node scripts/update-ticket-board.mjs new --title "Title" [--owner Backend] [--priority P1] [--area packages/db]
  node scripts/update-ticket-board.mjs status BK-0002 "In Progress"
  node scripts/update-ticket-board.mjs assign BK-0002 Frontend
`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
