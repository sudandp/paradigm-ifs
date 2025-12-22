package com.paradigm.ifs;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecurityCheckPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
