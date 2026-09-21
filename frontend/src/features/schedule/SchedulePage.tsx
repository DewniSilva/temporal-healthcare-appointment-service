import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { useAuth } from '../auth/useAuth';
import { addDoctorAvailability, addScheduleException, deleteDoctorAvailability, deleteScheduleException, getDoctorAvailability, getScheduleExceptions } from '../appointments/api';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SchedulePage() {
  const { user } = useAuth();
  const [doctorId, setDoctorId] = useState(user?.doctorId ?? '');
  const [window, setWindow] = useState({ dayOfWeek: '1', startTime: '09:00', endTime: '17:00' });
  const [exception, setException] = useState({ date: '', type: 'UNAVAILABLE' as 'UNAVAILABLE' | 'CUSTOM_HOURS', startTime: '', endTime: '', reason: '' });
  const client = useQueryClient();
  const key = ['schedule', doctorId] as const;
  const availability = useQuery({ queryKey: [...key, 'availability'], queryFn: () => getDoctorAvailability(doctorId), enabled: doctorId.length >= 3 });
  const exceptions = useQuery({ queryKey: [...key, 'exceptions'], queryFn: () => getScheduleExceptions(doctorId), enabled: doctorId.length >= 3 });
  const refresh = () => void client.invalidateQueries({ queryKey: key });
  const addWindow = useMutation({ mutationFn: () => addDoctorAvailability(doctorId, { dayOfWeek: Number(window.dayOfWeek), startTime: window.startTime, endTime: window.endTime, isActive: true }), onSuccess: refresh });
  const removeWindow = useMutation({ mutationFn: (id: string) => deleteDoctorAvailability(doctorId, id), onSuccess: refresh });
  const addException = useMutation({ mutationFn: () => addScheduleException(doctorId, { date: exception.date, type: exception.type, ...(exception.type === 'CUSTOM_HOURS' ? { startTime: exception.startTime, endTime: exception.endTime } : {}), ...(exception.reason ? { reason: exception.reason } : {}) }), onSuccess: refresh });
  const removeException = useMutation({ mutationFn: (id: string) => deleteScheduleException(doctorId, id), onSuccess: refresh });

  return <div className="space-y-6">
    <Card><CardHeader title="Manage doctor schedule" description="Weekly hours and one-off leave/custom-hour exceptions." />
      {user?.role === 'ADMIN' && <label className="block max-w-sm text-sm font-medium text-slate-700">Doctor ID<input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="doctor-001" /></label>}
      {!doctorId && <Alert variant="warning" title="Choose a doctor">Enter a doctor ID to manage their schedule.</Alert>}
    </Card>
    {doctorId && <><Card><CardHeader title="Weekly availability" /><form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); addWindow.mutate(); }}>
      <select value={window.dayOfWeek} onChange={(e) => setWindow({ ...window, dayOfWeek: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2">{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input type="time" value={window.startTime} onChange={(e) => setWindow({ ...window, startTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input type="time" value={window.endTime} onChange={(e) => setWindow({ ...window, endTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><Button type="submit" isLoading={addWindow.isPending}>Add hours</Button>
    </form><ul className="mt-5 divide-y">{availability.data?.map((item) => <li key={item.id} className="flex items-center justify-between py-3 text-sm"><span>{days[item.dayOfWeek]} · {item.startTime}–{item.endTime}</span><Button size="sm" variant="danger" onClick={() => removeWindow.mutate(item.id)}>Remove</Button></li>)}</ul></Card>
    <Card><CardHeader title="Leave and custom hours" /><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); addException.mutate(); }}><input required type="date" value={exception.date} onChange={(e) => setException({ ...exception, date: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><select value={exception.type} onChange={(e) => setException({ ...exception, type: e.target.value as typeof exception.type })} className="rounded-lg border border-slate-300 px-3 py-2"><option value="UNAVAILABLE">Unavailable</option><option value="CUSTOM_HOURS">Custom hours</option></select>{exception.type === 'CUSTOM_HOURS' && <><input required type="time" value={exception.startTime} onChange={(e) => setException({ ...exception, startTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><input required type="time" value={exception.endTime} onChange={(e) => setException({ ...exception, endTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /></>}<input placeholder="Reason (optional)" value={exception.reason} onChange={(e) => setException({ ...exception, reason: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" /><Button type="submit" isLoading={addException.isPending}>Add exception</Button></form><ul className="mt-5 divide-y">{exceptions.data?.map((item) => <li key={item.id} className="flex items-center justify-between py-3 text-sm"><span>{item.date.slice(0, 10)} · {item.type}{item.startTime ? ` · ${item.startTime}–${item.endTime}` : ''}</span><Button size="sm" variant="danger" onClick={() => removeException.mutate(item.id)}>Remove</Button></li>)}</ul></Card></>}
  </div>;
}
