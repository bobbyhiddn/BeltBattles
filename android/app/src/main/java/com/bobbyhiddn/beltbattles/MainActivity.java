package com.bobbyhiddn.beltbattles;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // M1: Android 15+ (targetSdk 35 and up) forces edge-to-edge; this makes Android 7-14 draw the same way, so the page's own
    // safe-area padding (index.html #stage) is the one place the system bars are cleared. Capacitor 8's docs ask for this call
    // whenever SystemBars' insetsHandling is not "disable"; Capacitor 9 will make it itself.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
