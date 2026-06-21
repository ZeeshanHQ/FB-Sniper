"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, Shield, Zap, MessageCircle, Settings2, LineChart, ChevronRight, TrendingUp, Users, Send, Eye, Heart, Share2 } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const yHeroImage = useTransform(scrollYProgress, [0, 0.3], [0, 80]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const barHeights = [40, 65, 45, 80, 55, 90, 70, 95, 60, 85, 75, 100];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }}
        className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-md border-b border-gray-100 py-2 shadow-sm' : 'bg-transparent py-4'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo-new.png" alt="FB-Sniper" width={160} height={40} className="h-6 sm:h-8 w-auto object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-6 lg:gap-8 font-medium text-sm text-gray-600">
            <Link href="#features" className="hover:text-blue-600 transition-colors">Features</Link>
            <Link href="#guide" className="hover:text-blue-600 transition-colors">Guide</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/signin" className="text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 sm:px-4 py-2 sm:py-2.5">
              Sign In
            </Link>
            <Link href="/signup" className="text-xs sm:text-sm font-semibold bg-gray-900 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-full hover:bg-gray-800 transition-all flex items-center gap-2 hover:shadow-lg hover:-translate-y-0.5">
              <span className="hidden sm:inline">Get Started</span>
              <span className="sm:hidden">Start</span>
              <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </Link>
          </div>
        </div>
      </motion.nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-24 lg:pt-40 lg:pb-32">
          {/* Animated Background Gradients */}
          <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
            <motion.div 
              animate={{ 
                rotate: [30, 45, 30],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#3b82f6] to-[#93c5fd] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
            />
          </div>
          
          <div className="mx-auto max-w-5xl text-center px-4 sm:px-6">
            <motion.div 
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center"
            >
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-semibold mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                FB-Sniper V1 Engine Live
              </motion.div>
              
              <motion.h1 variants={fadeUp} className="font-bricolage text-3xl sm:text-4xl md:text-6xl lg:text-[5rem] font-bold tracking-tight text-gray-900 mb-6 sm:mb-8 leading-[1.1]">
                Scale your reach with <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Elite Automation</span>
              </motion.h1>
              
              <motion.p variants={fadeUp} className="text-base sm:text-lg md:text-xl text-gray-600 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-2">
                Connect your Facebook assets, define your engagement rules, and watch FB-Sniper&apos;s high-speed engine manage everything on autopilot.
              </motion.p>
              
              <motion.div variants={fadeUp} className="flex flex-col items-center justify-center gap-3 sm:gap-4 w-full">
                <Link href="/signup" className="w-full max-w-xs sm:max-w-none text-base font-semibold bg-blue-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-full hover:bg-blue-700 transition-all shadow-[0_8px_30px_rgb(59,130,246,0.3)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.5)] hover:-translate-y-1 flex items-center justify-center gap-2">
                  Start Free Trial <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="#guide" className="group w-full max-w-xs sm:max-w-none text-base font-semibold bg-white text-gray-900 border border-gray-200 px-6 sm:px-8 py-3 sm:py-4 rounded-full hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                  See how it works <ChevronRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            </motion.div>

            {/* Hero Dashboard Mockup — Rich with fake data */}
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] as any }}
              style={{ y: yHeroImage }}
              className="mt-12 sm:mt-16 lg:mt-20 relative mx-auto max-w-5xl rounded-xl sm:rounded-2xl border border-gray-200/60 bg-white shadow-[0_20px_80px_-20px_rgba(0,0,0,0.15)] overflow-hidden"
            >
              {/* Browser Chrome */}
              <div className="h-11 bg-gray-100 border-b border-gray-200 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-white border border-gray-200 rounded-md px-4 py-1 text-[11px] text-gray-400 font-mono w-64 text-center">
                    fbsniper.astraventa.com/dashboard
                  </div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="bg-[#f8fafc] p-4 sm:p-6">
                {/* Dashboard Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
                  <div>
                    <div className="text-[11px] sm:text-[13px] font-bold text-gray-900 tracking-tight">Dashboard Overview</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Last updated: 2 min ago</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-2 sm:px-3 py-1.5 bg-blue-600 rounded-md text-[9px] sm:text-[10px] text-white font-semibold">+ New</div>
                    <div className="px-2 sm:px-3 py-1.5 bg-white border border-gray-200 rounded-md text-[9px] sm:text-[10px] text-gray-600 font-medium hidden sm:block">Export</div>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  {[
                    { label: "Total Reach", value: "2.4M", change: "+18.2%", icon: <Eye className="w-3.5 h-3.5" />, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Engagements", value: "184K", change: "+24.5%", icon: <Heart className="w-3.5 h-3.5" />, color: "text-rose-600", bg: "bg-rose-50" },
                    { label: "Posts Sent", value: "1,847", change: "+12.3%", icon: <Send className="w-3.5 h-3.5" />, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Pages Active", value: "32", change: "+3", icon: <Users className="w-3.5 h-3.5" />, color: "text-violet-600", bg: "bg-violet-50" },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 + i * 0.1 }}
                      className="bg-white rounded-lg sm:rounded-xl border border-gray-100 p-3 sm:p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <span className="text-[9px] sm:text-[10px] font-medium text-gray-400 uppercase tracking-wider">{stat.label}</span>
                        <div className={`w-5 h-5 sm:w-7 sm:h-7 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center`}>
                          {stat.icon}
                        </div>
                      </div>
                      <div className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight">{stat.value}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <TrendingUp className="w-2 h-2 sm:w-3 sm:h-3 text-emerald-500" />
                        <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-600">{stat.change}</span>
                        <span className="text-[9px] sm:text-[10px] text-gray-400 hidden sm:inline">vs last month</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Engagement Chart */}
                  <div className="lg:col-span-2 bg-white rounded-lg sm:rounded-xl border border-gray-100 p-3 sm:p-5 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-4 gap-2">
                      <div>
                        <div className="text-[11px] sm:text-[12px] font-bold text-gray-900">Engagement Overview</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-400">Daily engagement across all pages</div>
                      </div>
                      <div className="flex gap-2 sm:gap-3 text-[9px] sm:text-[10px] flex-wrap">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500"></span> Reactions</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500"></span> Comments</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-violet-500"></span> Shares</span>
                      </div>
                    </div>
                    {/* Bar Chart */}
                    <div className="flex items-end gap-1 sm:gap-1.5 h-24 sm:h-32">
                      {barHeights.map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: 1 + i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] as any }}
                          className={`flex-1 rounded-t-md ${i === 11 ? 'bg-blue-600' : i % 3 === 0 ? 'bg-blue-400' : i % 3 === 1 ? 'bg-emerald-400' : 'bg-violet-400'} opacity-80 hover:opacity-100 transition-opacity`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 text-[8px] sm:text-[9px] text-gray-300 font-mono overflow-x-auto">
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
                        <span key={m} className="flex-shrink-0">{m}</span>
                      ))}
                    </div>
                  </div>

                  {/* Activity Feed */}
                  <div className="bg-white rounded-lg sm:rounded-xl border border-gray-100 p-3 sm:p-5 shadow-sm">
                    <div className="text-[11px] sm:text-[12px] font-bold text-gray-900 mb-3 sm:mb-4">Recent Activity</div>
                    <div className="space-y-2 sm:space-y-3">
                      {[
                        { action: "Auto-replied to 24 comments", page: "TechDeals Pro", time: "2m ago", dot: "bg-emerald-500" },
                        { action: "Scheduled 8 posts", page: "Growth Hackers", time: "15m ago", dot: "bg-blue-500" },
                        { action: "New page connected", page: "Digital Marketing HQ", time: "1h ago", dot: "bg-violet-500" },
                        { action: "Campaign completed", page: "E-Commerce Tips", time: "3h ago", dot: "bg-amber-500" },
                        { action: "Auto-liked 156 posts", page: "Social Media Hub", time: "5h ago", dot: "bg-rose-500" },
                      ].map((item, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 1.2 + i * 0.1 }}
                          className="flex items-start gap-2 sm:gap-2.5"
                        >
                          <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${item.dot} mt-1 sm:mt-1.5 shrink-0`} />
                          <div className="min-w-0">
                            <div className="text-[10px] sm:text-[11px] font-medium text-gray-700 leading-tight">{item.action}</div>
                            <div className="text-[9px] sm:text-[10px] text-gray-400">{item.page} · {item.time}</div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Guide / How It Works Section */}
        <section id="guide" className="py-16 sm:py-24 lg:py-32 bg-gray-50 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeUp}
              className="mx-auto max-w-2xl lg:text-center mb-20"
            >
              <h2 className="text-base font-semibold leading-7 text-blue-600 mb-2 sm:mb-4">Workflow</h2>
              <p className="mt-2 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900 font-bricolage">
                How FB-Sniper Works
              </p>
              <p className="mt-3 sm:mt-4 text-base sm:text-lg leading-7 sm:leading-8 text-gray-600">
                Four simple steps to put your Facebook engagement on complete autopilot.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {[
                {
                  icon: <Zap className="w-6 h-6 text-blue-600" />,
                  step: "01",
                  title: "Connect Facebook",
                  desc: "Securely link your Meta account using our official API integration. Zero risk of bans."
                },
                {
                  icon: <Settings2 className="w-6 h-6 text-blue-600" />,
                  step: "02",
                  title: "Select Pages & Groups",
                  desc: "Choose the exact Pages and Groups you want FB-Sniper to manage and monitor."
                },
                {
                  icon: <MessageCircle className="w-6 h-6 text-blue-600" />,
                  step: "03",
                  title: "Configure Automation",
                  desc: "Set up your rules: scheduled posts, auto-replies, mass engagement, and smart comments."
                },
                {
                  icon: <LineChart className="w-6 h-6 text-blue-600" />,
                  step: "04",
                  title: "Dominate & Scale",
                  desc: "Watch the dashboard as the engine works 24/7 to scale your digital presence."
                }
              ].map((step, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  className="relative bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group"
                >
                  <div className="absolute top-4 sm:top-6 right-4 sm:right-6 text-4xl sm:text-5xl font-black text-gray-100/80 font-bricolage select-none">{step.step}</div>
                  <div className="relative z-10">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform">
                      {step.icon}
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3 font-bricolage">{step.title}</h3>
                    <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 sm:py-24 lg:py-32 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mx-auto max-w-2xl lg:text-center mb-20"
            >
              <h2 className="text-base font-semibold leading-7 text-blue-600 mb-2 sm:mb-4">Features</h2>
              <p className="mt-2 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900 font-bricolage">
                Built for power users
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="flex flex-col text-center sm:text-left"
              >
                <dt className="flex flex-col sm:flex-row items-center gap-x-4 text-xl font-bold leading-7 text-gray-900 font-bricolage mb-4 sm:mb-6">
                  <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-gray-900 shadow-lg mb-3 sm:mb-0">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                  Lightning Fast
                </dt>
                <dd className="flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">Execute complex automated workflows across hundreds of accounts simultaneously with zero latency infrastructure.</p>
                </dd>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col text-center sm:text-left"
              >
                <dt className="flex flex-col sm:flex-row items-center gap-x-4 text-xl font-bold leading-7 text-gray-900 font-bricolage mb-4 sm:mb-6">
                  <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-gray-900 shadow-lg mb-3 sm:mb-0">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  Enterprise Security
                </dt>
                <dd className="flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">Bank-grade encryption, elite proxy support, and intelligent human-emulation patterns keep your assets completely safe.</p>
                </dd>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex flex-col text-center sm:text-left"
              >
                <dt className="flex flex-col sm:flex-row items-center gap-x-4 text-xl font-bold leading-7 text-gray-900 font-bricolage mb-4 sm:mb-6">
                  <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-gray-900 shadow-lg mb-3 sm:mb-0">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  Deep Analytics
                </dt>
                <dd className="flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">Real-time comprehensive reporting on engagement, reach, and conversion metrics across your entire portfolio.</p>
                </dd>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative py-16 sm:py-24 lg:py-32 overflow-hidden bg-gray-900">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-indigo-900/30 mix-blend-overlay"></div>
          
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative mx-auto max-w-4xl text-center px-4 sm:px-6"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white font-bricolage mb-6 sm:mb-8">
              Ready to automate your success?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-300 mb-8 sm:mb-12 max-w-2xl mx-auto px-2">
              Join thousands of elite marketers pushing the absolute limits of what&apos;s possible with Facebook automation.
            </p>
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 px-6 sm:px-8 py-3 sm:py-5 rounded-full text-base sm:text-lg font-bold hover:bg-gray-100 hover:scale-105 transition-all shadow-2xl">
              Create your account <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 pt-12 sm:pt-16 pb-6 sm:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 sm:gap-8 mb-8 sm:mb-12">
            <div className="flex items-center gap-2">
              <Image src="/logo-new.png" alt="FB-Sniper" width={160} height={40} className="h-6 sm:h-8 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all" />
            </div>
            <div className="flex flex-wrap gap-4 sm:gap-6 lg:gap-8 font-medium text-gray-500 text-sm sm:text-base justify-center">
              <Link href="#features" className="hover:text-gray-900 transition-colors">Features</Link>
              <Link href="#guide" className="hover:text-gray-900 transition-colors">Guide</Link>
              <Link href="/terms" className="hover:text-gray-900 transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
            </div>
          </div>
          <div className="pt-6 sm:pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400">
            <p>© {new Date().getFullYear()} FB-Sniper. All rights reserved.</p>
            <p>Designed for elite automation.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
