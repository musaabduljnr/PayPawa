# PayPawa Mathematical Formulas & Analytics Specification

This document provides the authoritative mathematical specifications, equations, and algorithms used throughout the PayPawa Smart Electricity application.

---

## 1. Electricity Unit & Tariff Conversions

### 1.1 Token Units from Naira
When electricity distribution companies (DisCos) or payment gateways do not provide explicit units on vend:
$$\text{Units (kWh)} = \frac{\text{Amount (₦)}}{\text{Tariff Rate (₦/kWh)}} = \frac{\text{Amount (₦)}}{206.8}$$

### 1.2 Currency Scaling (Kobo to Naira)
$$\text{Amount (₦)} = \frac{\text{Amount (Kobo)}}{100}$$

---

## 2. Spending Analytics & Trends

### 2.1 Current Period Spend
$$\text{Current Spend (₦)} = \sum_{t \in \text{Period}} \text{Amount}_t$$

### 2.2 Period-over-Period Percentage Change ($\Delta\%$)
$$\Delta\% = \begin{cases} 
\left(\frac{\text{Current Spend} - \text{Previous Spend}}{\text{Previous Spend}}\right) \times 100 & \text{if Previous Spend} > 0 \\ 
0\% & \text{if Previous Spend} = 0 \quad (\text{Zero Baseline Safe})
\end{cases}$$

### 2.3 Spending Trend Classification
$$\text{Trend} = \begin{cases} 
\text{INCREASING} & \text{if } \Delta\% > +3\% \\ 
\text{DECREASING} & \text{if } \Delta\% < -3\% \\ 
\text{STABLE} & \text{if } -3\% \le \Delta\% \le +3\% \\ 
\text{INSUFFICIENT\_DATA} & \text{if Previous Spend} = 0 \text{ or Total Purchases} < 2 
\end{cases}$$

### 2.4 Average Daily Spend
$$\text{Average Daily Spend (₦/day)} = \frac{\text{Period Spend (₦)}}{\text{Period Days (e.g., 7, 30, 90)}}$$

---

## 3. Purchase Cadence & Velocity

### 3.1 Interval Calculation
For consecutive purchase cycles $i$ and $i-1$:
$$\Delta \text{Days}_i = \frac{T_i - T_{i-1}}{86,400 \times 1,000 \text{ ms}}$$

### 3.2 Median Purchase Interval (Cadence)
$$\text{Median Cadence (days)} = \text{median}\left(\Delta \text{Days}_1, \Delta \text{Days}_2, \dots, \Delta \text{Days}_{n-1}\right)$$
* **Odd $N$**: $\text{sorted}[N/2]$
* **Even $N$**: $\frac{\text{sorted}[N/2 - 1] + \text{sorted}[N/2]}{2}$

### 3.3 Purchase Velocity String
$$\text{Velocity} = \begin{cases} 
\text{"Every }\sim \text{Median Cadence days"} & \text{if } N \ge 2 \\ 
\text{"Need 2+ purchases for cadence"} & \text{if } N = 1 \\ 
\text{"Awaiting first recharge"} & \text{if } N = 0 
\end{cases}$$

---

## 4. Average Daily Usage (Burn Rate)

To avoid distortion from rapid top-ups (e.g., buying twice in 2 days), the daily burn rate is derived from total units across purchase cycles relative to median interval cadence:

$$\text{Average Units Per Cycle} = \frac{\sum_{i=1}^{N} \text{Units}_i}{\text{Total Purchase Cycles}}$$

$$\text{Average Daily Usage (kWh/day)} = \frac{\text{Average Units Per Cycle}}{\text{Median Purchase Interval (days)}}$$

---

## 5. Cumulative Remaining Energy Pool (Time-Decay Ledger)

Tracks remaining available energy across multiple unexhausted purchases using continuous time-decay at the established daily burn rate:

### 5.1 Inter-Transaction Decay
For each transaction $i \in \{1, \dots, N\}$:
$$\text{Decay}_i = \text{Daily Burn Rate} \times \frac{T_i - T_{i-1}}{86,400,000}$$
$$\text{Carried Over Balance}_i = \max\left(0, \text{Running Balance}_{i-1} - \text{Decay}_i\right)$$
$$\text{Running Balance}_i = \text{Carried Over Balance}_i + \text{Units}_i$$

### 5.2 Terminal Decay to Current Time ($T_{\text{now}}$)
$$\text{Final Delta Days} = \frac{T_{\text{now}} - T_N}{86,400,000}$$
$$\text{Estimated Remaining Balance (kWh)} = \max\left(0, \text{Running Balance}_N - (\text{Daily Burn Rate} \times \text{Final Delta Days})\right)$$

---

## 6. Estimated Days Remaining (Available Duration)

### 6.1 Exact Duration
$$\text{Exact Days} = \frac{\text{Estimated Remaining Units (kWh)}}{\text{Average Daily Usage (kWh/day)}}$$

### 6.2 Display Range Formatting
$$\text{Est. Days Display} = \begin{cases} 
\text{"}\lfloor \text{Exact Days} \rfloor\text{–}\lceil \text{Exact Days} \rceil\text{ days"} & \text{if } \text{Exact Days} \ge 1.0 \text{ and } \lfloor d \rfloor \ne \lceil d \rceil \\ 
\text{"}\sim \lfloor \text{Exact Days} \rfloor\text{ days"} & \text{if } \text{Exact Days} \ge 1.0 \text{ and } \lfloor d \rfloor = \lceil d \rceil \\ 
\text{"Recharge due soon"} & \text{if } 0 < \text{Exact Days} < 1.0 \\ 
\text{"Awaiting recharge"} & \text{if Remaining Units} = 0 \text{ or Total Purchases} = 0 \\ 
\text{"Need 2+ purchases"} & \text{if Total Purchases} = 1 
\end{cases}$$

---

## 7. Battery Progress & Energy Status Level

### 7.1 Circular Progress Percentage
$$\text{Progress \%} = \min\left(100, \max\left(5, \text{round}\left(\frac{\text{Remaining Units (kWh)}}{\text{Total Purchased Units (kWh)}} \times 100\right)\right)\right)$$

### 7.2 Energy Status Classification
$$\text{Status} = \begin{cases} 
\mathbf{HEALTHY\ (GREEN\ \#22c55e)} & \text{if } \text{Exact Days} > 7\text{ days \quad (or Progress } > 50\%) \\ 
\mathbf{MEDIUM\ (YELLOW\ \#eab308)} & \text{if } 2\text{ days} < \text{Exact Days} \le 7\text{ days \quad (or } 20\% < \text{Progress} \le 50\%) \\ 
\mathbf{LOW\ (RED\ \#ef4444)} & \text{if } \text{Exact Days} \le 2\text{ days \quad (or Progress } \le 20\%) 
\end{cases}$$

---

## 8. Appliance Profile Estimations

### 8.1 Individual Appliance Daily Load
$$\text{Daily Operating Hours} = \frac{\text{Weekly Operating Hours}}{7}$$
$$\text{Appliance Daily kWh} = \frac{\text{Wattage} \times \text{Quantity} \times \text{Daily Operating Hours}}{1,000}$$

### 8.2 Relative Load Contribution Breakdown
$$\text{Total Rated Appliance Load (kWh)} = \sum_{a \in \text{Appliances}} \text{Appliance Daily kWh}_a$$
$$\text{Relative Contribution \%} = \left(\frac{\text{Appliance Daily kWh}_a}{\text{Total Rated Appliance Load}}\right) \times 100$$
