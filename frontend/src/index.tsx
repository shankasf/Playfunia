import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SWRConfig } from "swr";

import "./styles/global.css";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CheckoutProvider } from "./context/CheckoutContext";
import { WaiverAuthProvider } from "./context/WaiverAuthContext";
import { swrConfig } from "./lib/swr";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <SWRConfig value={swrConfig}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <WaiverAuthProvider>
            <CheckoutProvider>
              <App />
            </CheckoutProvider>
          </WaiverAuthProvider>
        </AuthProvider>
      </BrowserRouter>
    </SWRConfig>
  </React.StrictMode>,
);

reportWebVitals();
