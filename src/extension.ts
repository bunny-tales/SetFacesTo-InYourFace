// A lot of the code used to make this extension is from the following repos:
// https://github.com/phindle/error-lens/blob/master/src/extension.ts
// https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample
// https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample
// https://code.visualstudio.com/api/extension-guides/webview
// and more that I can't find anymore

"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Extension activated");

  const provider = new CustomSidebarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CustomSidebarViewProvider.viewType,
      provider
    )
  );

  let _statusBarItem: vscode.StatusBarItem;
  let errorLensEnabled: boolean = true;

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // console.log('Visual Studio Code Extension "errorlens" is now active');

  // Commands are defined in the package.json file
  let disposableEnableErrorLens = vscode.commands.registerCommand(
    "ErrorLens.enable",
    () => {
      errorLensEnabled = true;

      const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor;
      if (activeTextEditor) {
        updateDecorationsForUri(activeTextEditor.document.uri);
      }
    }
  );

  context.subscriptions.push(disposableEnableErrorLens);

  let disposableDisableErrorLens = vscode.commands.registerCommand(
    "ErrorLens.disable",
    () => {
      errorLensEnabled = false;

      const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor;
      if (activeTextEditor) {
        updateDecorationsForUri(activeTextEditor.document.uri);
      }
    }
  );

  context.subscriptions.push(disposableDisableErrorLens);

  vscode.languages.onDidChangeDiagnostics(
    (diagnosticChangeEvent) => {
      onChangedDiagnostics(diagnosticChangeEvent);
    },
    null,
    context.subscriptions
  );

  // Note: URIs for onDidOpenTextDocument() can contain schemes other than file:// (such as git://)
  vscode.workspace.onDidOpenTextDocument(
    (textDocument) => {
      updateDecorationsForUri(textDocument.uri);
    },
    null,
    context.subscriptions
  );

  // Update on editor switch.
  vscode.window.onDidChangeActiveTextEditor(
    (textEditor) => {
      if (textEditor === undefined) {
        return;
      }
      updateDecorationsForUri(textEditor.document.uri);
    },
    null,
    context.subscriptions
  );

  function onChangedDiagnostics(
    diagnosticChangeEvent: vscode.DiagnosticChangeEvent
  ) {
    if (!vscode.window) {
      return;
    }

    const activeTextEditor: vscode.TextEditor | undefined =
      vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    // Many URIs can change - we only need to decorate the active text editor
    for (const uri of diagnosticChangeEvent.uris) {
      // Only update decorations for the active text editor.
      if (uri.fsPath === activeTextEditor.document.uri.fsPath) {
        updateDecorationsForUri(uri);
        break;
      }
    }
  }

  function updateDecorationsForUri(uriToDecorate: vscode.Uri) {
    if (!uriToDecorate) {
      return;
    }

    // Only process "file://" URIs.
    if (uriToDecorate.scheme !== "file") {
      return;
    }

    if (!vscode.window) {
      return;
    }

    const activeTextEditor: vscode.TextEditor | undefined =
      vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    if (!activeTextEditor.document.uri.fsPath) {
      return;
    }

    let numErrors = 0;

    if (errorLensEnabled) {
      let aggregatedDiagnostics: any = {};
      let diagnostic: vscode.Diagnostic;

      // Iterate over each diagnostic that VS Code has reported for this file. For each one, add to
      // a list of objects, grouping together diagnostics which occur on a single line.
      for (diagnostic of vscode.languages.getDiagnostics(uriToDecorate)) {
        let key = "line" + diagnostic.range.start.line;

        if (aggregatedDiagnostics[key]) {
          // Already added an object for this key, so augment the arrayDiagnostics[] array.
          aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic);
        } else {
          // Create a new object for this key, specifying the line: and a arrayDiagnostics[] array
          aggregatedDiagnostics[key] = {
            line: diagnostic.range.start.line,
            arrayDiagnostics: [diagnostic],
          };
        }

        switch (diagnostic.severity) {
          case 0:
            numErrors += 1;
            break;

          // Ignore other severities.
        }
      }
    }
  }
}

class CustomSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "set-faces-to-in-your-face.openview";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) { }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    // 1. LER CONFIGURAÇÃO
    const config = vscode.workspace.getConfiguration('set-faces-to-in-your-face');
    const customImagePath = config.get<string>('customErrorImage0');

    let customImageDir: vscode.Uri[] = [];

    // 2. TENTAR OBTER O DIRETÓRIO RAIZ PARA A IMAGEM CUSTOMIZADA
    if (customImagePath && customImagePath.length > 0) {
      try {
        // Cria um URI a partir do caminho do arquivo (se for um caminho local)
        const imageUri = vscode.Uri.file(customImagePath);

        // Adiciona o diretório pai (o 'pai' do arquivo) ao array de raízes.
        // Isso permite que o Webview carregue o arquivo.
        customImageDir.push(vscode.Uri.joinPath(imageUri, '..'));

      } catch (e) {
        // Ignora: provavelmente é uma URL HTTP/HTTPS, que não precisa ser tratada aqui.
        console.log("Caminho de imagem personalizada não é um URI de arquivo local válido.");
      }
    }

    // 3. DEFINIR OPÇÕES DO WEBVIEW
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      // Adiciona o URI da extensão (para assets internos) E os URIs dos diretórios customizados
      localResourceRoots: [
        this._extensionUri,
        ...customImageDir
      ],
    };

    // default webview will show doom face 0
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // This is called every second is decides which doom face to show in the webview
    setInterval(() => {
      // Nota: É mais eficiente usar um método de atualização dedicado (_updateWebview)
      // do que redefinir o HTML a cada segundo, mas para este exemplo, manteremos assim:
      webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    }, 1000);
  }

  private getHtmlContent(webview: vscode.Webview): string {

    // Lê todas as configurações de imagens personalizadas
    const config = vscode.workspace.getConfiguration('set-faces-to-in-your-face');

    let errors = getNumErr()[0];
    let errorFace: any;

    // Variáveis para armazenar o caminho/URL do nível de erro correspondente
    let customImagePath: string | undefined;
    let defaultImagePath: string; // O caminho padrão a ser usado se não houver customização

    // 1. Determina o Nível de Erro e qual caminho de customização e padrão usar
    if (errors === 0) {
      customImagePath = config.get<string>('customErrorImage0');
      defaultImagePath = "incredible0.png";
    }
    else if (errors < 5) {
      customImagePath = config.get<string>('customErrorImage1');
      defaultImagePath = "incredible1.png";
    }
    else if (errors < 10) {
      customImagePath = config.get<string>('customErrorImage2');
      defaultImagePath = "incredible2.png";
    }
    else {
      customImagePath = config.get<string>('customErrorImage3');
      defaultImagePath = "incredible3.png";
    }

    // 2. Aplica a Imagem
    if (customImagePath && customImagePath.length > 0) {
      // Se houver um caminho personalizado configurado para ESTE NÍVEL, use-o
      try {
        const customUri = vscode.Uri.file(customImagePath);
        errorFace = webview.asWebviewUri(customUri);
      } catch (e) {
        // Se for uma URL (http/https), usa o caminho como está.
        errorFace = customImagePath;
      }
    } else {
      // Se NÃO houver caminho personalizado para este nível, usa o padrão
      errorFace = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, "assets", defaultImagePath)
      );
    }

    return getHtml(errorFace);
  }
}

function getHtml(incredibleErrorFace: any) {
  return `
    <!DOCTYPE html>
			<html lang="en">
			<head>

			</head>

			<body>
			<section class="wrapper">
      <img class="doomFaces" src="${incredibleErrorFace}" alt="" >
      <h1 id="errorNum">${getNumErr()[0] + " errors"}</h1>
			</section>
      </body>

		</html>
  `;
}

// function to get the number of errors in the open file
function getNumErr(): number[] {
  const activeTextEditor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  let numErrors = 0;
  let numErr: number[] = [];
  if (!activeTextEditor) {
    numErr[0] = numErrors;
    return numErr;
  }
  const document: vscode.TextDocument = activeTextEditor.document;
  let aggregatedDiagnostics: any = {};
  let diagnostic: vscode.Diagnostic;

  // Iterate over each diagnostic that VS Code has reported for this file. For each one, add to
  // a list of objects, grouping together diagnostics which occur on a single line.
  for (diagnostic of vscode.languages.getDiagnostics(document.uri)) {
    let key = "line" + diagnostic.range.start.line;

    if (aggregatedDiagnostics[key]) {
      // Already added an object for this key, so augment the arrayDiagnostics[] array.
      aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic);
    } else {
      // Create a new object for this key, specifying the line: and a arrayDiagnostics[] array
      aggregatedDiagnostics[key] = {
        line: diagnostic.range.start.line,
        arrayDiagnostics: [diagnostic],
      };
    }

    switch (diagnostic.severity) {
      case 0:
        numErrors += 1;
        break;

      // Ignore other severities.
    }
  }


  numErr[0] = numErrors;

  return numErr;
}

// this method is called when your extension is deactivated
export function deactivate() { }