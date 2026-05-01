import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const ClaimsTrendChart = ({ data = [] }) => (
  <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6' }}>
    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>Claims Trend (Last 6 Months)</h3>
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
        <Tooltip formatter={(v, name) => name === 'amount' ? [`$${v.toLocaleString()}`, 'Total Amount'] : [v, 'Claims']} />
        <Legend />
        <Line yAxisId="left"  type="monotone" dataKey="count"  stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Claims" />
        <Line yAxisId="right" type="monotone" dataKey="amount" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="Amount" />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export default ClaimsTrendChart;
