import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import WeeklyPlan from '@/models/WeeklyPlan';

// GET /api/weekly-plans/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const plan = await WeeklyPlan.findById(params.id)
      .populate('userId', 'name email');

    if (!plan) {
      return NextResponse.json({ error: 'Weekly plan not found' }, { status: 404 });
    }

    const role = (session.user as any)?.role;
    const isAdmin = role === 'admin';

    // Non-admin users can only access their own plans
    if (!isAdmin && plan.userId._id.toString() !== (session.user as any).id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error('Error fetching weekly plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/weekly-plans/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const plan = await WeeklyPlan.findById(params.id);
    if (!plan) {
      return NextResponse.json({ error: 'Weekly plan not found' }, { status: 404 });
    }

    const role = (session.user as any)?.role;
    const isAdmin = role === 'admin';

    // Non-admin users can only edit their own plans
    if (!isAdmin && plan.userId.toString() !== (session.user as any).id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { weekNumber, year, startDate, endDate, content, result } = body;

    // Update fields
    if (weekNumber !== undefined) plan.weekNumber = weekNumber;
    if (year !== undefined) plan.year = year;
    if (startDate !== undefined) plan.startDate = new Date(startDate);
    if (endDate !== undefined) plan.endDate = new Date(endDate);
    if (content !== undefined) plan.content = content;
    if (result !== undefined) plan.result = result;

    await plan.save();

    // Populate user data
    await plan.populate('userId', 'name email');

    return NextResponse.json(plan);
  } catch (error) {
    console.error('Error updating weekly plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/weekly-plans/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const plan = await WeeklyPlan.findById(params.id);
    if (!plan) {
      return NextResponse.json({ error: 'Weekly plan not found' }, { status: 404 });
    }

    const role = (session.user as any)?.role;
    const isAdmin = role === 'admin';

    // Non-admin users can only delete their own plans
    if (!isAdmin && plan.userId.toString() !== (session.user as any).id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await WeeklyPlan.findByIdAndDelete(params.id);

    return NextResponse.json({ message: 'Weekly plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting weekly plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
