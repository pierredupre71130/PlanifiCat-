package fr.planificat.app;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView webView = getBridge().getWebView();
    // Expose l'impression Android (qui propose « Enregistrer au format PDF »)
    // à la page web : window.AndroidPrint.print()
    webView.addJavascriptInterface(new PrintBridge(webView), "AndroidPrint");
  }

  private class PrintBridge {
    private final WebView webView;

    PrintBridge(WebView webView) {
      this.webView = webView;
    }

    @JavascriptInterface
    public void print() {
      runOnUiThread(
        new Runnable() {
          @Override
          public void run() {
            PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter("PlanifiCat");
            printManager.print("PlanifiCat", adapter, new PrintAttributes.Builder().build());
          }
        }
      );
    }
  }
}
