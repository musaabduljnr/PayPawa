# ⚡ Smart Electricity App

A modern, high-performance React Native mobile application built with **Expo SDK 57** for managing prepaid electricity meters, buying tokens instantly, funding digital wallets, and tracking smart energy consumption.

---

## 📸 Key Features

- ⚡ **Prepaid Token Purchase:** Buy electricity tokens instantly for any Nigerian DISCO meter (YEDC, AEDC, EKEDC, IBEDC, KEDC, PHED, EEDC, JEDC, BEDC, KAEDCO).
- 🔑 **Instant 20-Digit Token Generation:** Live token generation with 1-tap copy to clipboard and step-by-step meter loading instructions.
- 💳 **Multi-Method Wallet Funding:** Top up your in-app wallet via Debit/Credit Card (Visa, Mastercard, Verve), Virtual Bank Transfer (Wema/SmartPay), or USSD codes.
- 🏠 **Multi-Meter Management:** Link, verify, and switch between multiple electricity meters (Home, Office, Shop) with active status badges.
- 📊 **Energy Analytics & Bento Insights:** Track monthly spend, estimated days remaining on current balance, daily average consumption (kWh), and usage trends across Week/Month/Year.
- 🤖 **AI Energy Assistant:** Smart assistant providing actionable advice on reducing high-drain appliance power consumption.
- 📜 **Full Activity Ledger:** Filterable transaction ledger for token purchases and wallet funding with real-time status badges (`Completed`, `Pending`, `Failed`).

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Expo SDK 57](https://docs.expo.dev/) (`expo ~57.0.16`, `react-native 0.86.2`, `react 19.2.3`) |
| **Navigation** | [Expo Router v57](https://docs.expo.dev/router/introduction/) (File-based routing with root at `src/app`) |
| **State Management** | React Context API (`src/context/AppContext.tsx`) |
| **Design System** | Custom Theme Tokens (`src/constants/theme.ts`) with HSL color palette, Deep Navy (`#0f172a`), and Electric Green (`#84cc16`) |
| **Typography** | `@expo-google-fonts/inter` (`Inter_400Regular` through `Inter_700Bold`) |
| **Iconography** | `@expo/vector-icons` (`MaterialIcons`, `MaterialCommunityIcons`, `Ionicons`) |

---

## 📁 Project Structure

```
smart-electricity-app/
├── assets/                  # Icons, splash screen images, adaptive icons
├── src/
│   ├── app/                 # Expo Router file-based screens
│   │   ├── (tabs)/          # Tab navigation screens
│   │   │   ├── _layout.tsx  # Bottom tab bar configuration
│   │   │   ├── home.tsx     # Executive Energy Dashboard
│   │   │   ├── activity.tsx # Transaction history ledger
│   │   │   ├── insights.tsx # Energy analytics & AI Assistant
│   │   │   └── profile.tsx  # Account & Meter management
│   │   ├── _layout.tsx      # Root stack layout & font loader
│   │   ├── index.tsx        # Conditional route guard & redirector
│   │   ├── onboarding.tsx   # 3-step carousel onboarding
│   │   ├── signup.tsx       # Auth & User registration
│   │   ├── buy-electricity.tsx # Electricity purchase & checkout
│   │   ├── fund-wallet.tsx  # 4-step wallet top-up flow
│   │   ├── add-meter.tsx    # Meter linking form
│   │   ├── verify-meter.tsx # Simulated DISCO API lookup tool
│   │   └── payment-success.tsx # Token receipt & loading guide
│   ├── constants/
│   │   └── theme.ts         # Design system tokens (Colors, Typography, Spacing)
│   └── context/
│       └── AppContext.tsx   # Global state provider
├── app.json                 # Expo app configuration
├── package.json             # Dependencies & scripts
└── tsconfig.json            # TypeScript configuration
```

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have Node.js (v18+) and npm installed on your development machine.

### 2. Installation
Clone the repository and install dependencies:

```bash
cd smart-electricity-app
npm install
```

### 3. Start the Development Server
Run the Expo dev server:

```bash
npm run start
```

In the interactive terminal output, you can choose to run the app on:
- **Android:** Press `a` or run `npm run android`
- **iOS:** Press `i` or run `npm run ios`
- **Web:** Press `w` or run `npm run web`

---

## 📱 App Flow Map

```mermaid
graph TD
    Start([Launch App]) --> Guard{Onboarded & Logged In?}
    Guard -- No --> Onboarding[src/app/onboarding.tsx]
    Onboarding --> Signup[src/app/signup.tsx]
    Signup --> Home

    Guard -- Yes --> Home[src/app/(tabs)/home.tsx]

    Home --> Buy[src/app/buy-electricity.tsx]
    Home --> Fund[src/app/fund-wallet.tsx]
    Home --> AddMeter[src/app/add-meter.tsx]
    Home --> Activity[src/app/(tabs)/activity.tsx]
    Home --> Insights[src/app/(tabs)/insights.tsx]
    Home --> Profile[src/app/(tabs)/profile.tsx]

    Buy --> Insufficient{Wallet Balance OK?}
    Insufficient -- No --> Fund
    Insufficient -- Yes --> Processing[Secure Payment]
    Processing --> Receipt[src/app/payment-success.tsx]
```

---

## 🗺️ Roadmap & Future Enhancements

- [ ] **State Persistence:** Integrate `@react-native-async-storage/async-storage` for local storage.
- [ ] **Payment Gateway:** Integrate live Paystack / Flutterwave payment APIs for card and bank transfers.
- [ ] **Real-Time AI:** Connect Google Gemini API for dynamic personalized energy consumption insights.
- [ ] **Push Notifications:** Configure `expo-notifications` for low-balance and high-usage alerts.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
