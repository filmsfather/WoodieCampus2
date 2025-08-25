import { PrismaClient, UserRole, NoticeCategory, ForumCategory } from '../src/generated/prisma/index.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Create sample users
  const adminPasswordHash = await bcrypt.hash('admin123!@#', 10);
  const instructorPasswordHash = await bcrypt.hash('instructor123!@#', 10);
  const studentPasswordHash = await bcrypt.hash('student123!@#', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@woodiecampus.com' },
    update: {},
    create: {
      email: 'admin@woodiecampus.com',
      passwordHash: adminPasswordHash,
      firstName: '관리자',
      lastName: '시스템',
      role: UserRole.ADMIN,
      isActive: true,
      isVerified: true,
      bio: '시스템 관리자입니다.',
    },
  });

  const instructor = await prisma.user.upsert({
    where: { email: 'instructor@woodiecampus.com' },
    update: {},
    create: {
      email: 'instructor@woodiecampus.com',
      passwordHash: instructorPasswordHash,
      firstName: '김강사',
      lastName: '',
      role: UserRole.INSTRUCTOR,
      isActive: true,
      isVerified: true,
      bio: '웹 개발 강사입니다.',
    },
  });

  const student1 = await prisma.user.upsert({
    where: { email: 'student1@woodiecampus.com' },
    update: {},
    create: {
      email: 'student1@woodiecampus.com',
      passwordHash: studentPasswordHash,
      firstName: '홍길동',
      lastName: '',
      role: UserRole.STUDENT,
      isActive: true,
      isVerified: true,
      bio: '열정적인 학습자입니다.',
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@woodiecampus.com' },
    update: {},
    create: {
      email: 'student2@woodiecampus.com',
      passwordHash: studentPasswordHash,
      firstName: '김학생',
      lastName: '',
      role: UserRole.STUDENT,
      isActive: true,
      isVerified: true,
      bio: '프론트엔드 개발에 관심이 많습니다.',
    },
  });

  console.log('✅ Users created');

  // 2. Create sample problem sets
  const webBasicsProblemSet = await prisma.problemSet.create({
    data: {
      title: 'HTML/CSS 기초',
      description: 'HTML과 CSS의 기본 개념과 활용법을 익힙니다.',
      category: '웹 기초',
      difficulty: 2,
      tags: ['HTML', 'CSS', '기초'],
      createdById: instructor.id,
    },
  });

  const jsBasicsProblemSet = await prisma.problemSet.create({
    data: {
      title: 'JavaScript 기초',
      description: 'JavaScript의 기본 문법과 DOM 조작을 배웁니다.',
      category: '프로그래밍',
      difficulty: 3,
      tags: ['JavaScript', '기초', 'DOM'],
      createdById: instructor.id,
    },
  });

  console.log('✅ Problem sets created');

  // 3. Create sample problems
  const htmlProblems = [
    {
      title: 'HTML 문서 구조 이해하기',
      description: 'HTML5 문서의 기본 구조를 파악하고 작성해보세요.',
      content: '<h1>과제 내용</h1><p>HTML5 문서의 기본 구조를 작성하고, 각 요소의 역할을 설명하세요.</p>',
      solution: '<!DOCTYPE html>, <html>, <head>, <body> 요소들의 역할과 구조',
      difficulty: 1,
      estimatedTime: 30,
      tags: ['HTML', '구조'],
    },
    {
      title: 'CSS 선택자 연습',
      description: 'CSS의 다양한 선택자를 활용하여 스타일을 적용해보세요.',
      content: '<h1>과제 내용</h1><p>주어진 HTML에 CSS 선택자를 사용하여 스타일을 적용하세요.</p>',
      solution: '클래스, ID, 요소, 속성 선택자 등의 활용법',
      difficulty: 2,
      estimatedTime: 45,
      tags: ['CSS', '선택자'],
    },
  ];

  for (const [index, problemData] of htmlProblems.entries()) {
    await prisma.problem.create({
      data: {
        ...problemData,
        order: index + 1,
        problemSetId: webBasicsProblemSet.id,
        createdById: instructor.id,
      },
    });
  }

  const jsProblems = [
    {
      title: '변수와 데이터 타입',
      description: 'JavaScript의 변수 선언과 데이터 타입을 이해합니다.',
      content: '<h1>과제 내용</h1><p>다양한 데이터 타입의 변수를 선언하고 활용해보세요.</p>',
      solution: 'let, const, var의 차이점과 string, number, boolean 등의 활용',
      difficulty: 2,
      estimatedTime: 40,
      tags: ['JavaScript', '변수'],
    },
    {
      title: '함수 작성하기',
      description: 'JavaScript 함수를 작성하고 호출해보세요.',
      content: '<h1>과제 내용</h1><p>간단한 계산을 수행하는 함수를 작성하세요.</p>',
      solution: 'function 선언식, 화살표 함수, 매개변수와 반환값',
      difficulty: 3,
      estimatedTime: 60,
      tags: ['JavaScript', '함수'],
    },
  ];

  for (const [index, problemData] of jsProblems.entries()) {
    await prisma.problem.create({
      data: {
        ...problemData,
        order: index + 1,
        problemSetId: jsBasicsProblemSet.id,
        createdById: instructor.id,
      },
    });
  }

  console.log('✅ Problems created');

  // 4. Create sample notices
  const notices = [
    {
      title: '우디캠퍼스에 오신 것을 환영합니다!',
      content: '<h2>안녕하세요!</h2><p>우디캠퍼스 학습 플랫폼에 오신 것을 환영합니다. 체계적인 학습과 성장의 여정을 함께 시작해보세요.</p>',
      category: NoticeCategory.GENERAL,
      isPinned: true,
    },
    {
      title: '새로운 JavaScript 고급 과정이 추가되었습니다',
      content: '<h2>새 과정 안내</h2><p>ES6+, 비동기 프로그래밍, 모던 프레임워크를 다루는 고급 과정이 추가되었습니다.</p>',
      category: NoticeCategory.ACADEMIC,
      isPinned: false,
    },
    {
      title: '시스템 점검 예정 안내',
      content: '<h2>시스템 점검</h2><p>더 나은 서비스 제공을 위해 시스템 점검을 실시합니다. 점검 시간 동안 서비스 이용에 불편을 드려 죄송합니다.</p>',
      category: NoticeCategory.SYSTEM,
      isPinned: false,
    },
  ];

  for (const noticeData of notices) {
    await prisma.notice.create({
      data: {
        ...noticeData,
        createdById: admin.id,
        publishedAt: new Date(),
      },
    });
  }

  console.log('✅ Notices created');

  // 5. Create sample forum posts
  const forumPosts = [
    {
      title: '프론트엔드 개발자 로드맵 공유',
      content: '<h2>프론트엔드 개발자가 되기 위한 학습 로드맵을 공유합니다</h2><p>HTML/CSS → JavaScript → React/Vue → TypeScript 순으로 학습하시는 것을 추천드립니다.</p>',
      category: ForumCategory.STUDY,
      tags: ['프론트엔드', '로드맵'],
      authorId: instructor.id,
    },
    {
      title: '학습 스터디 그룹 모집합니다',
      content: '<h2>JavaScript 스터디 그룹을 모집합니다!</h2><p>함께 학습하며 성장할 동료를 찾습니다. 주 2회, 온라인으로 진행 예정입니다.</p>',
      category: ForumCategory.GENERAL,
      tags: ['스터디', 'JavaScript'],
      authorId: student1.id,
    },
  ];

  for (const postData of forumPosts) {
    await prisma.forumPost.create({
      data: postData,
    });
  }

  console.log('✅ Forum posts created');

  // 6. Create sample learning progress
  const problems = await prisma.problem.findMany();
  
  for (const problem of problems.slice(0, 2)) {
    await prisma.learningProgress.create({
      data: {
        userId: student1.id,
        problemId: problem.id,
        status: 'COMPLETED',
        progressPercentage: 100.0,
        timeSpent: 45,
        score: 85,
        maxScore: 100,
        startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        lastAccessedAt: new Date(),
      },
    });

    await prisma.learningProgress.create({
      data: {
        userId: student2.id,
        problemId: problem.id,
        status: 'IN_PROGRESS',
        progressPercentage: 60.0,
        timeSpent: 30,
        startedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        lastAccessedAt: new Date(),
      },
    });
  }

  console.log('✅ Learning progress created');

  // 7. Create sample attendance records
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

  const attendanceData = [
    {
      userId: student1.id,
      date: twoDaysAgo,
      checkInTime: new Date(twoDaysAgo.setHours(9, 0, 0, 0)),
      checkOutTime: new Date(twoDaysAgo.setHours(18, 0, 0, 0)),
      status: 'PRESENT',
      workDuration: 8 * 60, // 8 hours in minutes
    },
    {
      userId: student1.id,
      date: yesterday,
      checkInTime: new Date(yesterday.setHours(9, 15, 0, 0)),
      checkOutTime: new Date(yesterday.setHours(17, 45, 0, 0)),
      status: 'LATE',
      workDuration: 8 * 60 - 30, // 7.5 hours
    },
    {
      userId: student2.id,
      date: twoDaysAgo,
      checkInTime: new Date(twoDaysAgo.setHours(8, 50, 0, 0)),
      checkOutTime: new Date(twoDaysAgo.setHours(18, 10, 0, 0)),
      status: 'PRESENT',
      workDuration: 8 * 60 + 20,
    },
  ];

  for (const attendance of attendanceData) {
    await prisma.attendanceRecord.create({
      data: attendance,
    });
  }

  console.log('✅ Attendance records created');

  // 8. Create sample achievements
  await prisma.achievement.create({
    data: {
      title: '첫 번째 문제 완료',
      description: '첫 번째 학습 문제를 성공적으로 완료했습니다!',
      type: 'LEARNING',
      points: 10,
      userId: student1.id,
      unlockedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.achievement.create({
    data: {
      title: '개근상',
      description: '일주일 연속 출석했습니다!',
      type: 'ATTENDANCE',
      points: 50,
      userId: student1.id,
      unlockedAt: new Date(),
    },
  });

  console.log('✅ Achievements created');

  console.log('🎉 Database seeding completed successfully!');
  
  // Print summary
  const userCount = await prisma.user.count();
  const problemSetCount = await prisma.problemSet.count();
  const problemCount = await prisma.problem.count();
  const noticeCount = await prisma.notice.count();
  const forumPostCount = await prisma.forumPost.count();
  
  console.log('\n📊 Seeding Summary:');
  console.log(`- Users: ${userCount}`);
  console.log(`- Problem Sets: ${problemSetCount}`);
  console.log(`- Problems: ${problemCount}`);
  console.log(`- Notices: ${noticeCount}`);
  console.log(`- Forum Posts: ${forumPostCount}`);
  console.log('\n🔐 Test Accounts:');
  console.log('- Admin: admin@woodiecampus.com / admin123!@#');
  console.log('- Instructor: instructor@woodiecampus.com / instructor123!@#');
  console.log('- Student: student1@woodiecampus.com / student123!@#');
  console.log('- Student: student2@woodiecampus.com / student123!@#');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });