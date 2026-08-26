/** Reports unclosed tags, stray closing tags and misplaced list items. */

import * as vscode from 'vscode';

import { Problem } from '../bbcode/parser';
import { DocumentModel } from '../documentModel';

const SOURCE = 'bbcode';
const DEBOUNCE_MS = 300;

export class DiagnosticsController implements vscode.Disposable {
    private readonly collection = vscode.languages.createDiagnosticCollection(SOURCE);
    private readonly disposables: vscode.Disposable[] = [];
    private readonly pending = new Map<string, NodeJS.Timeout>();

    constructor(private readonly model: DocumentModel) {
        this.disposables.push(
            this.collection,
            vscode.workspace.onDidOpenTextDocument((document) => this.schedule(document, 0)),
            vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document, DEBOUNCE_MS)),
            vscode.workspace.onDidCloseTextDocument((document) => this.clear(document)),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('bbcode')) {
                    this.refreshAll();
                }
            }),
        );
        this.refreshAll();
    }

    private refreshAll(): void {
        this.collection.clear();
        for (const document of vscode.workspace.textDocuments) {
            this.schedule(document, 0);
        }
    }

    private schedule(document: vscode.TextDocument, delay: number): void {
        if (document.languageId !== 'bbcode') {
            return;
        }
        const key = document.uri.toString();
        const existing = this.pending.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        this.pending.set(
            key,
            setTimeout(() => {
                this.pending.delete(key);
                this.validate(document);
            }, delay),
        );
    }

    private clear(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        const existing = this.pending.get(key);
        if (existing) {
            clearTimeout(existing);
            this.pending.delete(key);
        }
        this.collection.delete(document.uri);
    }

    private validate(document: vscode.TextDocument): void {
        if (document.isClosed) {
            return;
        }
        const config = this.model.config(document);
        if (!config.validateEnabled) {
            this.collection.delete(document.uri);
            return;
        }

        const { problems } = this.model.get(document);
        const diagnostics: vscode.Diagnostic[] = [];

        for (const problem of problems) {
            const severity = severityFor(problem, config.unknownTagSeverity);
            if (severity === undefined) {
                continue;
            }
            const range = new vscode.Range(document.positionAt(problem.start), document.positionAt(problem.end));
            const diagnostic = new vscode.Diagnostic(range, problem.message, severity);
            diagnostic.source = SOURCE;
            diagnostic.code = problem.code;
            if (problem.code === 'unknown-tag' && severity === vscode.DiagnosticSeverity.Hint) {
                diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
            }
            diagnostics.push(diagnostic);
        }

        this.collection.set(document.uri, diagnostics);
    }

    dispose(): void {
        for (const timer of this.pending.values()) {
            clearTimeout(timer);
        }
        this.pending.clear();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}

function severityFor(
    problem: Problem,
    unknownTagSeverity: 'ignore' | 'hint' | 'information' | 'warning',
): vscode.DiagnosticSeverity | undefined {
    if (problem.code === 'unknown-tag') {
        switch (unknownTagSeverity) {
            case 'ignore':
                return undefined;
            case 'information':
                return vscode.DiagnosticSeverity.Information;
            case 'warning':
                return vscode.DiagnosticSeverity.Warning;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }

    switch (problem.severity) {
        case 'warning':
            return vscode.DiagnosticSeverity.Warning;
        case 'information':
            return vscode.DiagnosticSeverity.Information;
        default:
            return vscode.DiagnosticSeverity.Hint;
    }
}
